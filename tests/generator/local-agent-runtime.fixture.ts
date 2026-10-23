/** Preserves owned frontend/backend readiness probes and their original process-group shutdown and binary restoration. */
import { expect } from "bun:test";
import { spawn } from "node:child_process";
import { chmod, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
export async function serveApiWhileFrontendIsDelayed(project: string): Promise<void> {
  const next = join(project, "node_modules/.bin/next");
  const original = `${next}-relkit-test`;
  await rename(next, original);
  try {
    await writeFile(next, "#!/usr/bin/env bun\nawait Bun.sleep(30_000);\n");
    await chmod(next, 0o755);
    await serveWithDelayedFrontend(project);
  } finally {
    await rm(next, { force: true });
    await rename(original, next);
  }
}

async function serveWithDelayedFrontend(project: string): Promise<void> {
  const apiPort = await availablePort();
  const inspectorPort = await availablePort();
  const child = spawn(process.execPath, ["dev"], {
    cwd: project,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      PORT: String(apiPort),
      RELKIT_INSPECTOR_PORT: String(inspectorPort),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  try {
    await assertApiReady(child, apiPort, () => output);
  } finally {
    const closedInTime = await stopDelayedFrontend(child, closed);
    expect(closedInTime, output).toBe(true);
    await expect(
      fetch(`http://127.0.0.1:${apiPort}/hello`, { signal: AbortSignal.timeout(250) }),
    ).rejects.toThrow();
  }
}

async function stopDelayedFrontend(
  child: ReturnType<typeof spawn>,
  closed: Promise<void>,
): Promise<boolean> {
  let closedInTime = false;
  try {
    signalOwnedGroup(child.pid, child.kill.bind(child), "SIGTERM");
    closedInTime = await Promise.race([
      closed.then(() => true),
      Bun.sleep(5_000).then(() => false),
    ]);
    return closedInTime;
  } finally {
    if (!closedInTime) {
      signalOwnedGroup(child.pid, child.kill.bind(child), "SIGKILL");
      await closed;
    }
  }
}

export function signalOwnedGroup(
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

export async function availablePort(): Promise<number> {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = server.port;
  await server.stop(true);
  return port;
}

export async function renderFrontend(project: string): Promise<void> {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = probe.port;
  await probe.stop(true);
  const child = Bun.spawn(
    [
      process.execPath,
      join(project, "node_modules/next/dist/bin/next"),
      "dev",
      "web",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { cwd: project, stdout: "pipe", stderr: "pipe" },
  );
  const output = Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  let response: Response | undefined;
  let body = "";
  try {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && child.exitCode === null) {
      try {
        response = await fetch(`http://127.0.0.1:${port}`, {
          signal: AbortSignal.timeout(20_000),
        });
        body = await response.text();
        break;
      } catch {
        await Bun.sleep(50);
      }
    }
  } finally {
    child.kill("SIGTERM");
    await child.exited;
  }
  const logs = (await output).join("\n");
  expect(response?.status, logs).toBe(200);
  expect(body).toContain("<!DOCTYPE html>");
}
async function assertApiReady(
  child: ReturnType<typeof spawn>,
  apiPort: number,
  output: () => string,
) {
  const deadline = Date.now() + 20_000;
  let response: Response | undefined;
  let body = "";
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      response = await fetch(`http://127.0.0.1:${apiPort}/hello?name=RelKit`, {
        signal: AbortSignal.timeout(1_000),
      });
      body = await response.text();
      if (response.status === 200) break;
    } catch {
      await Bun.sleep(25);
    }
  }
  expect(response?.status, output()).toBe(200);
  expect(body).toBe('{"message":"Hello, RelKit!"}');
  expect(child.exitCode, output()).toBeNull();
}
