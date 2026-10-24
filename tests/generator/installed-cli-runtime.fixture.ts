/** Preserves installed-project HTTP/readiness and joined process-group shutdown checks. */
import { expect } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Launches the same prepared application and joins its owned process group on every exit. */
export async function launchPreparedProject(
  project: string,
  script: "dev" | "start" = "dev",
): Promise<{ readonly body: string; readonly durationMs: number }> {
  const port = await availablePort();
  const inspectorPort = await availablePort();
  const startedAt = performance.now();
  const child = spawn(process.execPath, [script], {
    cwd: project,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      PORT: String(port),
      RELKIT_INSPECTOR_PORT: String(inspectorPort),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  try {
    return await waitPreparedProject(
      port,
      inspectorPort,
      script,
      startedAt,
      () => child.exitCode === null,
      () => output,
      project,
    );
  } finally {
    signalOwnedGroup(child.pid, child.kill.bind(child), "SIGTERM");
    const closedInTime = await Promise.race([
      closed.then(() => true),
      Bun.sleep(5_000).then(() => false),
    ]);
    expect(closedInTime, output).toBe(true);
    await expect(
      fetch(`http://127.0.0.1:${port}/hello`, { signal: AbortSignal.timeout(250) }),
    ).rejects.toThrow();
  }
}

/** Default installed development retains core transports without starting optional inspection. */
async function expectDevelopmentSurfaces(
  port: number,
  inspectorPort: number,
  project: string,
): Promise<void> {
  const graph = await fetch(`http://127.0.0.1:${port}/_relkit/v1/graph`);
  expect(graph.status).toBe(200);
  expect(await graph.json()).toMatchObject({ protocol: "relkit.inspector" });
  const openapi = await fetch(`http://127.0.0.1:${port}/_relkit/v1/openapi.json`);
  const document = (await openapi.json()) as { readonly paths?: Record<string, unknown> };
  expect(openapi.status).toBe(200);
  expect(document.paths).toHaveProperty("/hello");
  const reference = await fetch(`http://127.0.0.1:${port}/_relkit/v1/api-reference`);
  expect(reference.status).toBe(404);
  expect(await reference.text()).not.toContain("RELKIT API Reference");
  await expect(
    fetch(`http://127.0.0.1:${inspectorPort}`, {
      signal: AbortSignal.timeout(250),
    }),
  ).rejects.toThrow();
  expect(existsSync(join(project, ".relkit/connections"))).toBe(false);
  expect(existsSync(join(project, ".relkit/observability/observability.duckdb"))).toBe(false);
  const rich = await fetch(`http://127.0.0.1:${port}/_relkit/v1/runtime`);
  expect(rich.status).toBe(404);
  await rich.arrayBuffer();
}

/** Signals only the process group started by this fixture. */
function signalOwnedGroup(
  pid: number | undefined,
  kill: (signal?: NodeJS.Signals | number) => boolean,
  signal: NodeJS.Signals,
): void {
  try {
    if (process.platform === "win32") kill(signal);
    else if (pid !== undefined) process.kill(-pid, signal);
  } catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "ESRCH")) throw cause;
  }
}

/** Acquires and releases a native loopback port. */
async function availablePort(): Promise<number> {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = server.port;
  await server.stop(true);
  return port;
}

/** Waits for the existing two-request behavior before returning observed startup latency. */
async function waitPreparedProject(
  port: number,
  inspectorPort: number,
  script: "dev" | "start",
  startedAt: number,
  running: () => boolean,
  output: () => string,
  project: string,
): Promise<{ readonly body: string; readonly durationMs: number }> {
  const deadline = Date.now() + 20_000;
  let lastFailure = "";
  while (Date.now() < deadline && running()) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/hello?name=RelKit`, {
        signal: AbortSignal.timeout(1_000),
      });
      const body = await response.text();
      if (response.status === 200) {
        const subsequent = await fetch(`http://127.0.0.1:${port}/hello?name=Again`, {
          signal: AbortSignal.timeout(1_000),
        });
        expect(subsequent.status).toBe(200);
        expect(await subsequent.text()).toBe('{"message":"Hello, Again!"}');
        if (script === "dev") {
          await expectDevelopmentSurfaces(port, inspectorPort, project);
          expect(output()).toMatch(/\bReady\b/);
          expect(output()).not.toMatch(/Reference\s+http:\/\/\S+\/_relkit\/v1\/api-reference/);
        }
        return { body, durationMs: performance.now() - startedAt };
      }
    } catch (cause) {
      lastFailure = cause instanceof Error ? (cause.stack ?? cause.message) : String(cause);
      await Bun.sleep(25);
    }
  }
  throw new Error(`Prepared project did not become ready.\n${lastFailure}\n${output()}`);
}
