/**
 * A worker that refuses WebSocket upgrades as RelKit's does (403 `origin-denied` for a foreign
 * `Origin`, with its request id) and refuses a `?locked` upgrade with 401, behind a real
 * supervisor proxy on this runtime, and a raw client that reads the proxy's whole answer. Shared
 * by the Bun and Node proxy suites.
 */
import { connect } from "node:net";
import { Hono } from "hono";
import { loadRuntimeAdapter, type RuntimeServer } from "relkit/runtime";
import { createSupervisorProxy } from "../../../src/supervisor/proxy.js";

/** The proxy's answer to one handshake. */
export interface HandshakeAnswer {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/**
 * Starts the refusing worker and a proxy in front of it.
 * @returns The proxy's origin and a stop function.
 */
export async function startRefusingProxy(): Promise<{
  origin: string;
  stop: () => Promise<void>;
}> {
  const runtime = await loadRuntimeAdapter(
    typeof process.versions.bun === "string" ? "bun" : "node",
  );
  const app = new Hono();
  app.get(
    "*",
    (context, next) => {
      const origin = context.req.header("origin");
      if (origin !== undefined && origin !== new URL(context.req.url).origin)
        return problem(403, "origin-denied");
      if (context.req.query("locked") !== undefined) return problem(401, "unauthenticated");
      return next();
    },
    runtime.upgradeWebSocket(() => ({})),
  );
  const upstream: RuntimeServer = await runtime.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request, bindings) => app.fetch(request, bindings),
  });
  const proxy = createSupervisorProxy({ port: 0 });
  await proxy.listen();
  proxy.switchTarget({ token: { sourceToken: 1, generationToken: 1 }, port: upstream.port });
  return {
    origin: `http://127.0.0.1:${proxy.port}`,
    stop: async () => {
      await proxy.stop();
      await upstream.stop(true);
    },
  };
}

/**
 * The worker's Problem answer, with its request id in the header and the body.
 * @param status - HTTP status.
 * @param code - Problem code.
 * @returns The answer.
 */
function problem(status: number, code: string): Response {
  return new Response(JSON.stringify({ status, code, requestId: "request-worker" }), {
    status,
    headers: { "content-type": "application/problem+json", "x-request-id": "request-worker" },
  });
}

/**
 * Sends one WebSocket handshake through the proxy and reads the answer until the proxy closes.
 * @param origin - The proxy's origin.
 * @param path - Request path.
 * @param headers - Extra handshake headers, such as `Origin`.
 * @returns The status, lower-cased headers and body.
 */
export function handshake(
  origin: string,
  path: string,
  headers: Record<string, string>,
): Promise<HandshakeAnswer> {
  const url = new URL(origin);
  const lines = [
    `GET ${path} HTTP/1.1`,
    `Host: ${url.host}`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    "Sec-WebSocket-Version: 13",
    "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
    ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
  ];
  return new Promise((resolve, reject) => {
    const socket = connect(Number(url.port), url.hostname);
    let raw = "";
    const settle = (): void => {
      socket.destroy();
      const [head = "", ...rest] = raw.split("\r\n\r\n");
      const [status = "", ...fields] = head.split("\r\n");
      const entries = fields.map((line) => {
        const at = line.indexOf(":");
        return [line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim()] as const;
      });
      resolve({
        status: Number(/^HTTP\/1\.1 (\d{3})/u.exec(status)?.[1] ?? 0),
        headers: Object.fromEntries(entries),
        body: rest.join("\r\n\r\n"),
      });
    };
    socket.setTimeout(1_000, settle);
    socket.on("error", reject);
    socket.on("data", (chunk) => {
      raw += chunk.toString("latin1");
      const length = /\r\ncontent-length: *(\d+)/iu.exec(raw)?.[1];
      const end = raw.indexOf("\r\n\r\n");
      if (length !== undefined && end >= 0 && raw.length - end - 4 >= Number(length)) settle();
    });
    socket.on("end", settle);
    socket.write(`${lines.join("\r\n")}\r\n\r\n`);
  });
}
