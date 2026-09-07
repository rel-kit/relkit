import { afterEach, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { checkProject } from "../../packages/cli/src/commands/check.ts";
import { createRegistrationPlan, type ApplicationGraph } from "../../packages/graph/src/index.ts";
import { materializeJobs } from "../../packages/engine/src/materialize-jobs.ts";
import { createLocalJobProvider } from "../../packages/providers-local/src/runtime-capabilities.ts";
import {
  ADD_FAILURE_CODES,
  applyScaffoldPlan,
  normalizeAddRequest,
  planAdd,
} from "../../packages/create-relkit/src/index.ts";

const repository = resolve(import.meta.dir, "../..");
const templateRoot = join(repository, "templates/default/v1");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("the full bundle compiles in every starter and preserves its graph relationships", async () => {
  for (const template of ["minimal", "api", "agent"] as const) {
    const root = await project(template);
    await add(root, ["service", "Billing", "--full", "--no-install"]);
    await linkDependencies(root);
    const result = await checkProject({ projectRoot: root });
    expect(result.diagnostics).toEqual([]);
    const graph = JSON.parse(result.outputs.graph) as ApplicationGraph;
    const provider = createLocalJobProvider(join(root, ".relkit/state"), "local");
    try {
      const jobs = await materializeJobs({
        plan: createRegistrationPlan(graph),
        createQueue: provider.createQueue,
        engine: { invoke: async ({ input }) => input },
      });
      await jobs.jobs.get("billing.example-job")!.enqueue({ value: "example" });
      expect(await jobs.runNext("billing.example-job")).toMatchObject({
        state: "completed",
        value: { value: "example" },
      });
    } finally {
      await provider.close();
    }
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        {
          from: "billing",
          kind: "exposes-function",
          to: "billing.example",
          member: "example",
          order: 0,
        },
        {
          from: "billing",
          kind: "exposes-event",
          to: "billing.example-event",
          member: "exampleEvent",
          order: 0,
        },
        { from: "billing.example", kind: "declares-error", to: "billing.example-error" },
        { from: "billing.example", kind: "publishes-event", to: "billing.example-event" },
        {
          from: "billing.example-job",
          kind: "targets-function",
          to: "billing.example",
          role: "primary",
        },
        { from: "billing.example-agent", kind: "uses-tool", to: "billing.example-tool" },
      ]),
    );
  }
}, 30_000);

test("reused Docker profiles retain the post-scaffold startup reminder", async () => {
  const root = await project("minimal");
  await add(root, ["service", "Orders", "--full"]);
  for (const args of [
    ["cache", "Lookup", "--service", "orders", "--profile", "local"],
    ["cache", "Lookup", "--service", "orders", "--provider", "redis", "--source", "docker"],
  ]) {
    const plan = await planAdd(normalizeAddRequest([...args, "--project-root", root]));
    expect(plan.profiles).toEqual([]);
    expect(plan.warnings).toContainEqual(expect.objectContaining({ code: "docker-required" }));
    expect(plan.nextSteps).toContain("relkit local up");
    expect(plan.operations.some((operation) => operation.path === "relkit.config.ts")).toBe(false);
  }
  const connected = await planAdd(
    normalizeAddRequest([
      "cache",
      "Remote",
      "--service",
      "orders",
      "--provider",
      "redis",
      "--source",
      "connected",
      "--project-root",
      root,
    ]),
  );
  expect(connected.warnings.some((warning) => warning.code === "docker-required")).toBe(false);
  await expect(
    planAdd(
      normalizeAddRequest([
        "bucket",
        "Uploads",
        "--service",
        "orders",
        "--profile",
        "local",
        "--project-root",
        root,
      ]),
    ),
  ).rejects.toMatchObject({ code: ADD_FAILURE_CODES.collision });
  await add(root, ["service", "Billing", "--full"]);
  await linkDependencies(root);
  expect((await checkProject({ projectRoot: root })).diagnostics).toEqual([]);
});

test("route platform and singleton additions compile in every starter", async () => {
  for (const template of ["minimal", "api", "agent"] as const) {
    const root = await project(template);
    await add(root, ["route", "/users/:id/details", "--mode", "route"]);
    await add(root, ["middleware", "Request Log", "--path", "/users/*"]);
    await add(root, ["transform", "Trim Input"]);
    await add(root, ["database", "--dialect", "sqlite", "--no-install"]);
    await add(root, ["auth", "--database-dialect", "sqlite", "--no-install"]);
    await linkDependencies(root);
    const result = await checkProject({ projectRoot: root });
    expect(result.diagnostics).toEqual([]);
    expect(await Bun.file(join(root, "src/routes/users/[id]/details/route.ts")).exists()).toBe(
      true,
    );
    const operation = JSON.parse(result.outputs.openapi).paths["/users/{id}/details"].get;
    expect(operation.responses).toEqual({
      default: { description: "Response returned by the route handler" },
    });
    expect(operation["x-relkit"]).not.toHaveProperty("functionId");
    expect(await Bun.file(join(root, "src/routes/api/auth/[[...auth]]/route.ts")).exists()).toBe(
      true,
    );
  }
}, 30_000);

test("database and auth-chained schemas compile for all Bun-native dialects", async () => {
  for (const dialect of ["sqlite", "postgresql", "mysql"] as const) {
    for (const kind of ["database", "auth"] as const) {
      const root = await project("minimal");
      const option = kind === "database" ? "--dialect" : "--database-dialect";
      await add(root, [kind, option, dialect, "--no-install"]);
      await linkDependencies(root);
      expect((await checkProject({ projectRoot: root })).diagnostics).toEqual([]);
    }
  }
}, 30_000);

test("every standalone add kind compiles in every starter", async () => {
  for (const template of ["minimal", "api", "agent"] as const) {
    const root = await project(template);
    for (const args of [
      ["service", "Billing"],
      ["error", "Issue", "--service", "hello"],
      ["event", "Updated", "--service", "hello"],
      ["function", "Work", "--service", "hello"],
      ["event-function", "On Updated", "--service", "hello", "--event", "hello.updated-event"],
      ["job", "Work", "--service", "hello", "--target", "hello.work"],
      ["cache", "State", "--service", "hello"],
      ["bucket", "Files", "--service", "hello"],
      ["tool", "Work", "--service", "hello", "--target", "hello.work"],
      ["tool", "Find Order", "--service", "hello", "--create-function", "Find Order"],
      ["tool", "Find Order", "--create-service", "Toolbox", "--create-function", "Find Order"],
      ["prompt", "Policy", "--service", "hello", "--text", "Be concise."],
      [
        "agent",
        "Worker",
        "--service",
        "hello",
        "--model-provider",
        "openai",
        "--model-id",
        "gpt-5-mini",
        "--tool",
        "hello.work-tool",
        "--prompt",
        "hello.policy-prompt",
      ],
      ["constants", "Limits", "--service", "hello"],
      ["route", "/work/:id", "--mode", "service-route", "--service", "hello", "--map", "GET=work"],
      ["middleware", "Request Log", "--path", "/work/*"],
      ["transform", "Trim Input"],
      ["database", "--dialect", "sqlite"],
      ["auth", "--database-dialect", "sqlite"],
    ])
      await add(root, [...args, "--no-install"]);
    await linkDependencies(root);
    const result = await checkProject({ projectRoot: root });
    expect(result.diagnostics).toEqual([]);
    const graph = JSON.parse(result.outputs.graph) as ApplicationGraph;
    for (const domain of ["hello", "toolbox"]) {
      expect(graph.edges).toContainEqual({
        from: `${domain}.find-order`,
        kind: "exposes-as-tool",
        to: `${domain}.find-order-tool`,
      });
    }
  }
}, 30_000);

test("tool function creation rejects collisions without changing existing files", async () => {
  const root = await project("minimal");
  const path = join(root, "src/hello/functions/hello.function.ts");
  const original = await Bun.file(path).text();
  await expect(
    planAdd(
      normalizeAddRequest([
        "tool",
        "Lookup",
        "--service",
        "hello",
        "--create-function",
        "hello",
        "--project-root",
        root,
      ]),
    ),
  ).rejects.toMatchObject({ code: ADD_FAILURE_CODES.collision });
  expect(await Bun.file(path).text()).toBe(original);
  expect(await Bun.file(join(root, "src/hello/tools/lookup.tool.ts")).exists()).toBe(false);
});

test("snapshots simple, custom, and full service plans", async () => {
  const variants = [
    ["service", "Billing"],
    ["service", "Billing", "--include", "function", "--include", "event", "--include", "tool"],
    ["service", "Billing", "--full"],
  ];
  for (const args of variants) {
    const root = await project("minimal");
    const plan = await planAdd(
      normalizeAddRequest([...args, "--project-root", root, "--no-install"]),
    );
    expect({
      operations: plan.operations,
      dependencies: plan.dependencies,
      artifacts: plan.artifacts,
      profiles: plan.profiles,
      warnings: plan.warnings,
      nextSteps: plan.nextSteps,
    }).toMatchSnapshot();
  }
});

test("rejects ambiguous services and existing route methods before mutation", async () => {
  const root = await project("api");
  await expect(
    planAdd(normalizeAddRequest(["function", "Ambiguous", "--project-root", root])),
  ).rejects.toMatchObject({ code: ADD_FAILURE_CODES.usage });
  await expect(
    planAdd(
      normalizeAddRequest([
        "route",
        "/hello",
        "--mode",
        "service-route",
        "--service",
        "hello",
        "--map",
        "GET=hello",
        "--project-root",
        root,
      ]),
    ),
  ).rejects.toMatchObject({ code: ADD_FAILURE_CODES.collision });
});

async function project(template: string): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "relkit-add-acceptance-"));
  roots.push(parent);
  const root = join(parent, "app");
  await cp(join(templateRoot, template), root, { recursive: true });
  return root;
}

async function add(root: string, args: readonly string[]): Promise<void> {
  const request = normalizeAddRequest([...args, "--project-root", root]);
  await applyScaffoldPlan(await planAdd(request), {
    commandRunner: async () => ({ exitCode: 0 }),
    relkitExecutable: "relkit",
  });
}

async function linkDependencies(root: string): Promise<void> {
  const relkit = join(root, "node_modules/@relkit");
  await mkdir(relkit, { recursive: true });
  for (const name of ["app", "testing", "drizzle", "better-auth"]) {
    await link(join(repository, "packages", name), join(relkit, name));
  }
  for (const name of ["ai-sdk", "docker", "local", "redis", "s3"]) {
    await link(join(repository, "integrations/packages", name), join(relkit, name));
  }
  await link(
    join(repository, "packages/drizzle/node_modules/drizzle-orm"),
    join(root, "node_modules/drizzle-orm"),
  );
  await link(
    join(repository, "packages/better-auth/node_modules/better-auth"),
    join(root, "node_modules/better-auth"),
  );
  await link(
    join(repository, "node_modules/.bun/@types+bun@1.3.10/node_modules/@types/bun"),
    join(root, "node_modules/@types/bun"),
  );
}

async function link(target: string, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  if (!(await Bun.file(path).exists())) await symlink(target, path);
}
