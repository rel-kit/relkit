import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const FIXTURE = fileURLToPath(new URL("./fixtures/adapter-server.mjs", import.meta.url));
const SHA256_RELKIT = createHash("sha256").update("relkit").digest("hex");

let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "relkit-runtime-adapter-"));
  await mkdir(join(root, "docs"));
  await writeFile(join(root, "docs", "index.html"), "<h1>Docs</h1>");
  await writeFile(join(root, ".secret"), "hidden");
});

afterAll(() => rm(root, { recursive: true, force: true }));

describe.each([
  ["bun", "bun"],
  ["node", "node"],
] as const)("%s runtime adapter", (runtime, executable) => {
  test("serves JSON, static files, WebSocket upgrades, hashing and environment", async () => {
    const server = await start(executable, runtime);
    try {
      const base = `http://127.0.0.1:${server.port}`;
      const info = (await (await fetch(`${base}/runtime`)).json()) as Record<string, unknown>;
      expect(info).toEqual({ name: runtime, hash: SHA256_RELKIT, env: "marker" });

      const page = await fetch(`${base}/docs/`);
      expect([page.status, await page.text()]).toEqual([200, "<h1>Docs</h1>"]);
      expect(page.headers.get("content-type")).toMatch(/^text\/html/);
      const etag = page.headers.get("etag");
      expect(etag).toMatch(/^"[0-9a-f]+-[0-9a-f]+"$/);
      expect(
        (await fetch(`${base}/docs/index.html`, { headers: { "if-none-match": etag! } })).status,
      ).toBe(304);
      const ranged = await fetch(`${base}/docs/index.html`, { headers: { range: "bytes=4-7" } });
      expect([ranged.status, await ranged.text(), ranged.headers.get("content-range")]).toEqual([
        206,
        "Docs",
        "bytes 4-7/13",
      ]);
      expect((await fetch(`${base}/.secret`)).status).toBe(404);

      expect(await echo(`ws://127.0.0.1:${server.port}/ws`, "ping")).toBe("echo:ping");
    } finally {
      await server.stop();
    }
  }, 30_000);
});

/**
 * Sends one WebSocket message and resolves with the first reply.
 * @param url - WebSocket endpoint.
 * @param message - Text to send.
 * @returns The reply text.
 */
function echo(url: string, message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error("WebSocket echo timed out")), 10_000);
    socket.addEventListener("open", () => socket.send(message));
    socket.addEventListener("message", (event) => {
      clearTimeout(timer);
      socket.close();
      resolve(String(event.data));
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("WebSocket connection failed"));
    });
  });
}

/**
 * Starts the fixture on one runtime and waits for its port.
 * @param executable - `bun` or `node`.
 * @param runtime - Adapter the fixture loads.
 * @returns The port and a stop function.
 */
async function start(executable: string, runtime: string) {
  const child = spawn(executable, [FIXTURE], {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: {
      ...process.env,
      RELKIT_FIXTURE_RUNTIME: runtime,
      RELKIT_FIXTURE_ROOT: root,
      RELKIT_FIXTURE_MARKER: "marker",
    },
  });
  let diagnostics = "";
  child.stderr?.on("data", (chunk: Buffer) => (diagnostics += chunk.toString()));
  child.stdout?.resume();
  const stopped = new Promise<void>((resolve) => child.once("close", () => resolve()));
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    const force = setTimeout(() => child.kill("SIGKILL"), 2_000);
    await stopped;
    clearTimeout(force);
  };
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${runtime} fixture did not start. ${diagnostics}`)),
      15_000,
    );
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`${runtime} fixture exited ${code}: ${diagnostics}`));
    });
    child.once("message", (value) => {
      clearTimeout(timer);
      resolve((value as { port: number }).port);
    });
  }).catch(async (error: unknown) => {
    await stop();
    throw error;
  });
  return { port, stop };
}
