import { afterEach, expect, test } from "bun:test";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join, relative } from "node:path";
import { buildProject } from "../../packages/cli/src/commands/build.ts";
import { startProject } from "../../packages/cli/src/commands/start.ts";

const API = "/_zsys/v1";
const ARTIFACTS = [
  ".dockerignore",
  "Dockerfile",
  "application.graph.json",
  "manifest.json",
  "openapi.json",
  "server/index.js",
  "server/index.ts",
  "server/runtime.manifest.ts",
] as const;
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("builds reproducible production context without local env or state", async () => {
  const firstRoot = await copyProject();
  const secondRoot = await copyProject();
  for (const root of [firstRoot, secondRoot]) {
    await writeFile(join(root, ".env"), "ZSYS_SYNTHETIC_SECRET=container-secret");
    await mkdir(join(root, ".zsys", "state"), { recursive: true });
    await writeFile(join(root, ".zsys", "state", "local.json"), "local-state");
    await mkdir(join(root, ".zsys", "observability"), { recursive: true });
    await writeFile(join(root, ".zsys", "observability", "request.ndjson"), "local-record");
  }

  const first = await buildProject({ projectRoot: firstRoot });
  const second = await buildProject({ projectRoot: secondRoot });
  expect(first.ok).toBe(true);
  expect(second.ok).toBe(true);
  const firstBytes = await readArtifacts(first.buildDirectory);
  const secondBytes = await readArtifacts(second.buildDirectory);
  expect(secondBytes).toEqual(firstBytes);
  expect(await filesIn(first.buildDirectory)).toEqual([...ARTIFACTS].sort());

  const dockerfile = firstBytes.get("Dockerfile") ?? "";
  const dockerignore = firstBytes.get(".dockerignore") ?? "";
  expect(dockerfile).toContain("FROM oven/bun:1.3.10");
  expect(dockerfile).toContain("USER bun");
  expect(dockerfile).toContain("STOPSIGNAL SIGTERM");
  expect(dockerfile).not.toContain("COPY .");
  expect(dockerignore).toContain(".env");
  expect(dockerignore).toContain(".zsys/state");
  expect(dockerignore).toContain(".zsys/observability");
  expect([...firstBytes.values()].join("\n")).not.toContain("container-secret");
});

test("keeps liveness available while provider readiness is pending", async () => {
  const root = await copyProject();
  await buildProject({ projectRoot: root });
  const probes: Array<{ path: string; status: number; body: Record<string, unknown> }> = [];
  const probe: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    const body = (await response.clone().json()) as Record<string, unknown>;
    probes.push({ path: new URL(input.toString()).pathname, status: response.status, body });
    return response;
  };

  const started = await startProject({
    projectRoot: root,
    port: 0,
    healthTimeoutMs: 3_000,
    environment: { ZSYS_PROVIDER_READY_DELAY_MS: "1000" },
    fetch: probe,
  });
  try {
    expect(probes[0]).toMatchObject({ path: `${API}/health/live`, status: 200 });
    expect(probes[1]).toMatchObject({
      path: `${API}/health/ready`,
      status: 503,
      body: { environmentReady: true, providerReady: false },
    });
    expect(
      probes.some(
        ({ path, status, body }) =>
          path === `${API}/health/ready` &&
          status === 200 &&
          body.status === "ready" &&
          body.providerReady === true,
      ),
    ).toBe(true);
  } finally {
    await started.stop();
  }
});

test("stops admission, cancels in-flight work, flushes telemetry, and exits on time", async () => {
  const root = await copyProject();
  const startedFile = join(root, "in-flight.started");
  const cancelledFile = join(root, "in-flight.cancelled");
  const flushedFile = join(root, "telemetry.flushed");
  await writeFile(join(root, "src", "functions", "hello.function.ts"), handlerSource());
  await buildProject({ projectRoot: root });
  const started = await startProject({
    projectRoot: root,
    port: 0,
    healthTimeoutMs: 3_000,
    environment: {
      ZSYS_TEST_INFLIGHT_FILE: startedFile,
      ZSYS_TEST_CANCEL_FILE: cancelledFile,
      ZSYS_TEST_FLUSH_FILE: flushedFile,
      ZSYS_DRAIN_TIMEOUT_MS: "50",
      ZSYS_TELEMETRY_FLUSH_TIMEOUT_MS: "100",
    },
  });

  try {
    const url = `http://${started.hostname}:${started.port}/hello/drain`;
    const inFlight = fetch(url)
      .then(async (response) => ({ status: response.status, body: await response.text() }))
      .catch(() => ({ status: undefined, body: "" }));
    await waitForFile(startedFile);

    const shutdownAt = Date.now();
    started.process.kill("SIGTERM");
    const rejected = await fetch(`http://${started.hostname}:${started.port}/hello/new`);
    const result = await inFlight;
    const exitCode = await within(started.exited, 1_000);

    expect(rejected.status).toBe(503);
    expect([200, 499, undefined]).toContain(result.status);
    await waitForFile(cancelledFile);
    await waitForFile(flushedFile);
    expect(exitCode).toBe(0);
    expect(Date.now() - shutdownAt).toBeLessThan(1_000);
  } finally {
    if (started.process.exitCode === null) await started.stop();
  }
});

async function copyProject(): Promise<string> {
  const root = await mkdtemp(join("/tmp", "zsys-container-test-"));
  roots.push(root);
  await cp(join(process.cwd(), "tests/compiler/fixtures/valid-minimal"), root, { recursive: true });
  await cp(join(process.cwd(), "apps/fixture-commerce/package.json"), join(root, "package.json"));
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

async function readArtifacts(buildDirectory: string): Promise<Map<string, string>> {
  return new Map(
    await Promise.all(
      ARTIFACTS.map(
        async (path) => [path, await readFile(join(buildDirectory, path), "utf8")] as const,
      ),
    ),
  );
}

async function filesIn(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...(await filesIn(root, path)));
    else files.push(relative(root, path).replaceAll("\\", "/"));
  }
  return files.sort();
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`Timed out waiting for ${path}.`);
}

async function within<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Operation exceeded ${timeoutMs} ms.`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function handlerSource(): string {
  return `import { defineFunction } from "@zsys/app";
import { z } from "@zsys/schema";

const hello = defineFunction({
  id: "hello",
  input: z.object({ name: z.string() }),
  output: z.object({ message: z.string() }),
  handler: async (input, context) => {
    const started = process.env.ZSYS_TEST_INFLIGHT_FILE;
    if (started !== undefined) await Bun.write(started, "started");
    const flushed = process.env.ZSYS_TEST_FLUSH_FILE;
    (globalThis as Record<string, unknown>)["__zsys_flush_telemetry"] = async () => {
      if (flushed !== undefined) await Bun.write(flushed, "flushed");
    };
    await new Promise<void>((resolve) => {
      if (context.signal.aborted) return resolve();
      context.signal.addEventListener("abort", () => resolve(), { once: true });
    });
    const cancelled = process.env.ZSYS_TEST_CANCEL_FILE;
    if (context.signal.aborted && cancelled !== undefined) await Bun.write(cancelled, "cancelled");
    return { message: \`Hello, \${input.name}\` };
  },
});

export default hello;
`;
}
