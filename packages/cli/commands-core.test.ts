import { afterEach, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GRAPH_VERSION } from "@relkit/contracts";
import { buildProject } from "./src/commands/build.js";
import { checkProject } from "./src/commands/check.js";
import { startProject } from "./src/commands/start.js";
import { readBuilt } from "./src/commands/start-built.js";
import { linkWorkspacePackages } from "./test-workspace.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("check emits activatable success and portable structured diagnostics on failure", async () => {
  const validRoot = await copyProject("tests/compiler/fixtures/valid-minimal");
  const valid = await checkProject({ projectRoot: validRoot });
  expect(valid.ok).toBe(true);
  expect(valid.activatable).toBe(true);
  expect(valid.graphHash).toMatch(/^sha256:/);
  expect(await readFile(join(valid.generatedDirectory, "event-registry.d.ts"), "utf8")).toContain(
    "interface EventRegistry",
  );
  expect(JSON.parse(await readFile(join(valid.generatedDirectory, "diagnostics.json")))).toEqual(
    [],
  );

  const invalidRoot = await copyProject("tests/compiler/fixtures/error-duplicate-id");
  const invalid = await checkProject({ projectRoot: invalidRoot });
  expect(invalid.ok).toBe(false);
  expect(invalid.activatable).toBe(false);
  expect(invalid.outputs.manifest).toBe("");
  expect(invalid.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "RELKIT_DUPLICATE_ID",
      severity: "error",
      file: "src/duplicate/functions/second.function.ts",
      related: [expect.objectContaining({ file: "src/duplicate/functions/first.function.ts" })],
    }),
  );
  expect(JSON.stringify(invalid.diagnostics)).not.toContain(invalidRoot);
});

test("check locates removed config keys and shows the fixed replacement", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  await writeFile(
    join(root, "relkit.config.ts"),
    'export default {\n  source: ["lib/**/*.ts"],\n};\n',
  );

  const result = await checkProject({ projectRoot: root });
  expect(result.ok).toBe(false);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "RELKIT_CONFIG_LEGACY_KEY",
      file: "relkit.config.ts",
      line: 2,
      column: 3,
      message: expect.stringContaining('RELKIT always discovers "src/**/*.ts"'),
    }),
  );
  expect(result.diagnostics[0]?.message).toContain("defineApp({ env: defineEnv({})");
});

test("check refreshes generated event types before project typechecking", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  await writeFile(join(root, "src/type-error.ts"), "const value: string = 1;\nvoid value;\n");
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { strict: true, noEmit: true },
      files: ["src/type-error.ts", ".relkit/generated/event-registry.d.ts"],
    }),
  );

  const result = await checkProject({ projectRoot: root });
  expect(result.ok).toBe(false);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ code: "TS2322", file: "src/type-error.ts", line: 1 }),
  );
  expect(result.diagnostics.some(({ code }) => code === "TS6053")).toBe(false);
  expect(await readFile(join(root, ".relkit/generated/event-registry.d.ts"), "utf8")).toContain(
    "interface EventRegistry",
  );
}, 30_000);

test("build succeeds from a checked graph and reports failed checks", async () => {
  const validRoot = await copyProject("tests/compiler/fixtures/valid-minimal");
  const built = await buildProject({ projectRoot: validRoot });
  expect(built.ok).toBe(true);
  expect(built.artifacts).toContain("manifest.json");
  const manifest = JSON.parse(await readFile(join(built.buildDirectory, "manifest.json")));
  expect(manifest).toMatchObject({
    graphHash: built.graphHash,
    activationFingerprint: built.activationFingerprint,
    entrypoint: "server/index.ts",
    containerEntrypoint: "server/index.js",
    contextIgnoreFile: ".dockerignore",
  });
  const artifactPaths = [
    ".dockerignore",
    "Dockerfile",
    "application.graph.json",
    "manifest.json",
    "openapi.json",
    "server/index.js",
    "server/index.ts",
    "server/runtime-activation.json",
    "server/runtime-integrations.plan.json",
    "server/runtime.manifest.ts",
    "server/runtime-integrations.ts",
  ];
  const readArtifacts = (): Promise<readonly string[]> =>
    Promise.all(artifactPaths.map((path) => readFile(join(built.buildDirectory, path), "utf8")));
  const firstArtifacts = await readArtifacts();
  expect(firstArtifacts[1]).toContain("FROM oven/bun:1.3.10");
  expect(firstArtifacts[1]).toContain("USER bun");
  expect(firstArtifacts[1]).toContain("STOPSIGNAL SIGTERM");
  expect(firstArtifacts[1]).toContain("COPY server/index.js ./server/index.js");
  expect(firstArtifacts[1]).not.toContain("COPY .");
  expect(firstArtifacts[0]).toContain(".env");
  expect(firstArtifacts[0]).toContain(".relkit/state");
  expect(firstArtifacts[6]).toContain("createObservabilityRuntime");
  expect(firstArtifacts[6]).toContain("materializeEvents");
  expect(firstArtifacts[6]).toContain("materializeJobs");
  expect(firstArtifacts[6]).toContain("invokeAgent");
  expect(firstArtifacts[6]).toContain("formatHumanLog(record)");
  expect(firstArtifacts[6]).toContain('source: request.source ?? "http"');
  expect(firstArtifacts[6]).toContain("SIGTERM");
  expect(firstArtifacts[6]).not.toContain("@sentry/bun");
  expect(firstArtifacts[6]).not.toContain("__relkit_flush_sentry");
  expect(firstArtifacts.at(-1)).toContain("runtimeIntegrationModules = []");
  await rm(built.buildDirectory, { recursive: true, force: true });
  const rebuilt = await buildProject({ projectRoot: validRoot });
  expect(rebuilt.ok).toBe(true);
  expect(await readArtifacts()).toEqual(firstArtifacts);
  const runtimeIntegrationsPath = join(
    rebuilt.buildDirectory,
    "server/runtime-integrations.plan.json",
  );
  const runtimeIntegrations = await readFile(runtimeIntegrationsPath, "utf8");
  await writeFile(runtimeIntegrationsPath, `${runtimeIntegrations} `);
  await expect(readBuilt(rebuilt.buildDirectory)).rejects.toThrow(
    "Built activation fingerprint does not match its artifacts.",
  );
  await writeFile(runtimeIntegrationsPath, runtimeIntegrations);
  const graphPath = join(rebuilt.buildDirectory, "application.graph.json");
  const staleGraph = JSON.parse(await readFile(graphPath, "utf8")) as Record<string, unknown>;
  await writeFile(graphPath, JSON.stringify({ ...staleGraph, contractVersion: GRAPH_VERSION - 1 }));
  await expect(readBuilt(rebuilt.buildDirectory)).rejects.toThrow(
    "Built graph contract version 7 is unsupported; expected 8. Rebuild with `relkit build`.",
  );

  const invalidRoot = await copyProject("tests/compiler/fixtures/error-route-collision");
  const failed = await buildProject({ projectRoot: invalidRoot });
  expect(failed.ok).toBe(false);
  expect(failed.artifacts).toEqual([]);
  expect(failed.diagnostics).toContainEqual(
    expect.objectContaining({ code: "RELKIT_ROUTE_COLLISION" }),
  );
});

test("build carries server port, body limit, and API docs settings into runtime artifacts", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  await writeFile(
    join(root, "relkit.config.ts"),
    'import { defineApp, defineEnv } from "@relkit/app/config";\nexport default defineApp({ env: defineEnv({}), server: { port: 4321, maxBodyBytes: 2048, apiDocs: { enabledInProduction: true } } });\n',
  );
  const built = await buildProject({ projectRoot: root });
  expect(built.ok).toBe(true);
  const manifest = JSON.parse(await readFile(join(built.buildDirectory, "manifest.json")));
  expect(manifest.server).toEqual({
    port: 4321,
    maxBodyBytes: 2048,
    apiDocs: { enabledInProduction: true },
    clientContract: true,
    mcp: true,
  });
  const server = await readFile(join(built.buildDirectory, "server/index.ts"), "utf8");
  expect(server).toContain("maxBodyBytes: 2048");
  expect(server).toContain("enabledInProduction: true");
});

test("start serves health, graph, inspector collections, and rejects an invalid build", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  const built = await buildProject({ projectRoot: root });
  const started = await startProject({ projectRoot: root, port: 0, healthTimeoutMs: 3_000 });
  try {
    const live = await fetch(`http://${started.hostname}:${started.port}/_relkit/v1/health/live`);
    const graph = await fetch(`http://${started.hostname}:${started.port}/_relkit/v1/graph`);
    expect(live.status).toBe(200);
    expect(graph.status).toBe(200);
    expect((await graph.json()) as { graphHash: string }).toMatchObject({
      generationId: "generation.runtime",
      graphHash: built.graphHash,
      activationFingerprint: built.activationFingerprint,
      graph: { nodes: expect.arrayContaining([expect.objectContaining({ id: "hello" })]) },
    });
    const routes = await fetch(`http://${started.hostname}:${started.port}/_relkit/v1/routes`);
    const functions = await fetch(
      `http://${started.hostname}:${started.port}/_relkit/v1/functions`,
    );
    expect(routes.status).toBe(200);
    expect(functions.status).toBe(200);
    expect((await routes.json()) as { items: unknown[] }).toMatchObject({
      items: [expect.objectContaining({ id: "hello.route" })],
    });
    expect((await functions.json()) as { items: unknown[] }).toMatchObject({
      items: [expect.objectContaining({ id: "hello.say-hello" })],
    });
    const route = await fetch(`http://${started.hostname}:${started.port}/hello/RelKit`);
    expect(route.status).toBe(200);
    expect(await route.json()).toEqual({ message: "Hello, RelKit" });
    const action = await fetch(
      `http://${started.hostname}:${started.port}/_relkit/v1/actions/functions/hello.say-hello/invoke`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "hello-action" },
        body: JSON.stringify({
          generationId: "generation.runtime",
          graphHash: built.graphHash,
          input: { name: "Inspector" },
        }),
      },
    );
    expect(action.status).toBe(200);
    expect(await action.json()).toMatchObject({ output: { message: "Hello, Inspector" } });
    const logUrl = `http://${started.hostname}:${started.port}/_relkit/v1/logs`;
    const logs = (await (
      await fetch(`${logUrl}?functionId=hello.say-hello&severity=info&limit=1`)
    ).json()) as { items: Array<{ invocationId: string }>; nextCursor?: string };
    expect(logs.items).toEqual([
      expect.objectContaining({ component: "hello.say-hello", message: "hello invoked" }),
    ]);
    expect(logs.nextCursor).toBeDefined();
    const continued = (await (
      await fetch(
        `${logUrl}?functionId=hello.say-hello&severity=info&limit=1&cursor=${logs.nextCursor}`,
      )
    ).json()) as { items: Array<{ invocationId: string }> };
    expect(continued.items).toEqual([
      expect.objectContaining({ component: "hello.say-hello", message: "hello invoked" }),
    ]);
    expect(continued.items[0]?.invocationId).not.toBe(logs.items[0]?.invocationId);
  } finally {
    await started.stop();
  }
  expect(await started.exited).toBe(0);

  await expect(
    startProject({ projectRoot: root, buildDirectory: join(root, ".relkit", "missing") }),
  ).rejects.toThrow();
});

test("start cleanup follows an external abort signal", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  await buildProject({ projectRoot: root });
  const controller = new AbortController();
  const started = await startProject({
    projectRoot: root,
    port: 0,
    signal: controller.signal,
    healthTimeoutMs: 3_000,
  });
  controller.abort();
  await started.exited;
  expect(started.process.exitCode).toBe(0);
});

test("production start keeps internal endpoints private", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  await buildProject({ projectRoot: root });
  const started = await startProject({
    projectRoot: root,
    port: 0,
    environment: { NODE_ENV: "production" },
  });
  try {
    const live = await fetch(`http://${started.hostname}:${started.port}/_relkit/v1/health/live`);
    const graph = await fetch(`http://${started.hostname}:${started.port}/_relkit/v1/graph`);
    expect(live.status).toBe(200);
    expect(graph.status).toBe(404);
    expect(await graph.text()).not.toContain("Runtime graph hash verification failed");
  } finally {
    await started.stop();
  }
});

async function copyProject(relativePath: string): Promise<string> {
  const root = await mkdtemp(join(process.cwd(), ".relkit-cli-test-"));
  roots.push(root);
  await cp(join(process.cwd(), relativePath), root, { recursive: true });
  await cp(join(process.cwd(), "examples/commerce/package.json"), join(root, "package.json"));
  await rm(join(root, "node_modules"), { recursive: true, force: true });
  await linkWorkspacePackages(root);
  return root;
}
