import { afterEach, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { buildProject } from "./src/commands/build.js";
import { checkProject } from "./src/commands/check.js";
import { startProject } from "./src/commands/start.js";

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
      code: "ZSYS_DUPLICATE_ID",
      severity: "error",
      file: "src/functions/second.function.ts",
      related: [expect.objectContaining({ file: "src/functions/first.function.ts" })],
    }),
  );
  expect(JSON.stringify(invalid.diagnostics)).not.toContain(invalidRoot);
});

test("build succeeds from a checked graph and reports failed checks", async () => {
  const validRoot = await copyProject("tests/compiler/fixtures/valid-minimal");
  const built = await buildProject({ projectRoot: validRoot });
  expect(built.ok).toBe(true);
  expect(built.artifacts).toContain("manifest.json");
  const manifest = JSON.parse(await readFile(join(built.buildDirectory, "manifest.json")));
  expect(manifest).toMatchObject({
    graphHash: built.graphHash,
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
    "server/runtime.manifest.ts",
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
  expect(firstArtifacts[0]).toContain(".zsys/state");
  expect(firstArtifacts[6]).toContain("createInspectableObservabilityHooks");
  expect(firstArtifacts[6]).toContain("SIGTERM");
  await rm(built.buildDirectory, { recursive: true, force: true });
  const rebuilt = await buildProject({ projectRoot: validRoot });
  expect(rebuilt.ok).toBe(true);
  expect(await readArtifacts()).toEqual(firstArtifacts);

  const invalidRoot = await copyProject("tests/compiler/fixtures/error-route-collision");
  const failed = await buildProject({ projectRoot: invalidRoot });
  expect(failed.ok).toBe(false);
  expect(failed.artifacts).toEqual([]);
  expect(failed.diagnostics).toContainEqual(
    expect.objectContaining({ code: "ZSYS_ROUTE_COLLISION" }),
  );
});

test("start serves health and graph and rejects an invalid build", async () => {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  const built = await buildProject({ projectRoot: root });
  const started = await startProject({ projectRoot: root, port: 0, healthTimeoutMs: 3_000 });
  try {
    const live = await fetch(`http://${started.hostname}:${started.port}/_zsys/v1/health/live`);
    const graph = await fetch(`http://${started.hostname}:${started.port}/_zsys/v1/graph`);
    expect(live.status).toBe(200);
    expect(graph.status).toBe(200);
    expect((await graph.json()) as { graphHash: string }).toMatchObject({
      graphHash: built.graphHash,
    });
    const route = await fetch(`http://${started.hostname}:${started.port}/hello/ZSys`);
    expect(route.status).toBe(200);
    expect(await route.json()).toEqual({ message: "Hello, ZSys" });
  } finally {
    await started.stop();
  }
  expect(await started.exited).toBe(0);

  await expect(
    startProject({ projectRoot: root, buildDirectory: join(root, ".zsys", "missing") }),
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
    const live = await fetch(`http://${started.hostname}:${started.port}/_zsys/v1/health/live`);
    const graph = await fetch(`http://${started.hostname}:${started.port}/_zsys/v1/graph`);
    expect(live.status).toBe(200);
    expect(graph.status).toBe(404);
    expect(await graph.text()).not.toContain("Runtime graph hash verification failed");
  } finally {
    await started.stop();
  }
});

async function copyProject(relativePath: string): Promise<string> {
  const root = await mkdtemp(join(process.cwd(), ".zsys-cli-test-"));
  roots.push(root);
  await cp(join(process.cwd(), relativePath), root, { recursive: true });
  await cp(join(process.cwd(), "apps/fixture-commerce/package.json"), join(root, "package.json"));
  await rm(join(root, "node_modules"), { recursive: true, force: true });
  await linkWorkspacePackages(root);
  return root;
}

async function linkWorkspacePackages(root: string): Promise<void> {
  const scope = join(root, "node_modules", "@zsys");
  await mkdir(scope, { recursive: true });
  for (const name of [
    "agents",
    "app",
    "buckets",
    "cache",
    "cloud-aws",
    "compiler",
    "config",
    "contracts",
    "diagnostics",
    "engine",
    "events",
    "functions",
    "graph",
    "jobs",
    "observability",
    "providers-local",
    "routes",
    "runtime-effect",
    "runtime-hono",
    "schema",
    "supervisor",
    "testing",
    "tools",
  ])
    await symlink(join(process.cwd(), "packages", name), join(scope, name));
}
