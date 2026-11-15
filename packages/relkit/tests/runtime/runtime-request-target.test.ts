/**
 * 27.1: no listener a runtime adapter starts serves Bun's development error page, in development
 * or with `NODE_ENV`/`RELKIT_ENV` set to production; a failure outside the application's error
 * mapping answers a small 500 without paths, a malformed `Host` answers a bare 400, and a request
 * without `Host` is served, the same on Bun and on Node.
 */
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const FIXTURE = fileURLToPath(new URL("./fixtures/adapter-server.mjs", import.meta.url));
const MODES = [
  ["development", {}],
  ["NODE_ENV=production", { NODE_ENV: "production" }],
  ["RELKIT_ENV=production", { RELKIT_ENV: "production" }],
] as const;
// Not `xn--`: Bun's URL parser refuses it and Node's accepts it, so the adapters cannot agree.
const MALFORMED_HOSTS = ["a b", "x:abc", "%", "[", "user@x", "x:99999", "x/url?q=1#", "x#y"];

describe.each([
  ["bun", "bun"],
  ["node", "node"],
] as const)("%s runtime adapter", (runtime, executable) => {
  test.each(MODES)(
    "%s: a throw outside the error mapping answers a small 500",
    async (_, env) => {
      const server = await start(executable, runtime, env);
      try {
        const answer = await raw(server.port, request("/throw", `127.0.0.1:${server.port}`));
        expect(answer.status, answer.text.slice(0, 300)).toBe("500");
        expect(answer.body.length).toBeLessThan(400);
        expect(answer.body).not.toMatch(/<|\/Users\/|\/home\/|file:|thrown at|node_modules/);
      } finally {
        await server.stop();
      }
    },
    30_000,
  );

  test("a malformed Host answers a bare 400 and a missing one is served", async () => {
    const server = await start(executable, runtime, {});
    try {
      for (const host of MALFORMED_HOSTS) {
        const answer = await raw(server.port, request("/url", host));
        expect([host, answer.status]).toEqual([host, "400"]);
        expect(answer.body).toBe("");
      }
      const old = await raw(server.port, "GET /url HTTP/1.0\r\n\r\n");
      expect(old.status, old.text).toBe("200");
      expect(JSON.parse(old.body)).toMatchObject({ host: null });
      expect(new URL((JSON.parse(old.body) as { url: string }).url).pathname).toBe("/url");
    } finally {
      await server.stop();
    }
  }, 30_000);
});

/**
 * Frames a GET with the given `Host`, closing the connection after the answer.
 * @param target - Request target. @param host - `Host` value.
 * @returns Request bytes.
 */
function request(target: string, host: string): string {
  return `GET ${target} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`;
}

/**
 * Writes raw bytes on a new connection and reads until the server closes it.
 * @param port - Server port. @param bytes - Request bytes.
 * @returns The status, the whole answer and its body.
 */
async function raw(port: number, bytes: string) {
  const socket = connect(port, "127.0.0.1");
  let text = "";
  socket.on("data", (chunk: Buffer) => (text += chunk.toString("latin1")));
  socket.write(bytes);
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => socket.destroy(), 5_000);
    socket.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("error", () => undefined);
  });
  const end = text.indexOf("\r\n\r\n");
  let body = end === -1 ? "" : text.slice(end + 4);
  if (/^transfer-encoding: chunked/im.test(text.slice(0, end)))
    body = body.replace(/^0\r\n\r\n$/, "");
  return { status: /^HTTP\/1\.[01] (\d{3})/.exec(text)?.[1], text, body };
}

/**
 * Starts the adapter fixture on one runtime and waits for its port.
 * @param executable - `bun` or `node`. @param runtime - Adapter the fixture loads.
 * @param env - Extra environment, such as `NODE_ENV`.
 * @returns The port and a stop function.
 */
async function start(executable: string, runtime: string, env: Record<string, string>) {
  const base: Record<string, string | undefined> = { ...process.env };
  delete base.NODE_ENV;
  delete base.RELKIT_ENV;
  const child = spawn(executable, [FIXTURE], {
    stdio: ["ignore", "ignore", "pipe", "ipc"],
    env: { ...base, ...env, RELKIT_FIXTURE_RUNTIME: runtime, RELKIT_FIXTURE_ROOT: "." },
  });
  let diagnostics = "";
  child.stderr?.on("data", (chunk: Buffer) => (diagnostics += chunk.toString()));
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
      () => reject(new Error(`${runtime} did not start. ${diagnostics}`)),
      15_000,
    );
    child.once("exit", (code) => reject(new Error(`${runtime} exited ${code}: ${diagnostics}`)));
    child.once("message", (value) => {
      clearTimeout(timer);
      resolve((value as { port: number }).port);
    });
  });
  return { port, stop };
}
