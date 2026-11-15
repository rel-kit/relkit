import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { connect } from "node:net";
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

  // RK-41: a request whose client declared no body reaches the handler without one.
  test("delivers a request without a body when the client sent none", async () => {
    const server = await start(executable, runtime);
    try {
      const seen = (framing: string, method = "POST") =>
        rawExchange(server.port, `${method} /body HTTP/1.1\r\n${framing}`);
      const none = { bodyNull: true, transferEncoding: null, text: null };
      expect(await seen("")).toMatchObject({ method: "POST", contentLength: null, ...none });
      expect(await seen("Content-Length: 0\r\n")).toMatchObject({ contentLength: "0", ...none });
      expect(await seen("", "DELETE")).toMatchObject({ method: "DELETE", ...none });
      expect(await seen("Content-Length: 5\r\n", "PATCH")).toMatchObject({
        method: "PATCH",
        bodyNull: false,
        contentLength: "5",
        text: "hello",
      });
      expect(await seen("Transfer-Encoding: chunked\r\n")).toMatchObject({
        bodyNull: false,
        transferEncoding: "chunked",
        text: "hello",
      });
    } finally {
      await server.stop();
    }
  }, 30_000);
});

/**
 * Sends one raw request, framed exactly as given, on its own connection.
 * @param port - Server port.
 * @param head - Request line and framing headers, each ending in CRLF.
 * @returns The decoded JSON answer.
 */
async function rawExchange(port: number, head: string): Promise<Record<string, unknown>> {
  const body = head.includes("Content-Length: 5")
    ? "hello"
    : head.includes("chunked")
      ? "5\r\nhello\r\n0\r\n\r\n"
      : "";
  const socket = connect(port, "127.0.0.1");
  let raw = "";
  socket.on("data", (chunk: Buffer) => (raw += chunk.toString()));
  socket.write(`${head}Host: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n${body}`);
  await new Promise<void>((resolve, reject) => {
    socket.once("close", () => resolve());
    socket.once("error", reject);
  });
  const text = raw.slice(raw.indexOf("\r\n\r\n") + 4);
  return JSON.parse(text.startsWith("{") ? text : decodeChunked(text)) as Record<string, unknown>;
}

/**
 * Decodes a chunked response body.
 * @param text - Raw chunked body.
 * @returns The joined chunk data.
 */
function decodeChunked(text: string): string {
  let rest = text;
  let out = "";
  while (rest.length > 0) {
    const line = rest.indexOf("\r\n");
    const size = Number.parseInt(rest.slice(0, line), 16);
    if (!(size > 0)) break;
    out += rest.slice(line + 2, line + 2 + size);
    rest = rest.slice(line + 4 + size);
  }
  return out;
}

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
