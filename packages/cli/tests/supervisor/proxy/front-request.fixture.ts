/**
 * 27.1 through the development front: a worker on this runtime's adapter that reports the method,
 * path, `Host` and body framing it received, behind a real supervisor proxy with the front's
 * inspection block, and a raw client that writes each request's bytes exactly as a test gives
 * them. Shared by the Bun and Node suites.
 */
import { connect } from "node:net";
import { loadRuntimeAdapter, type RuntimeServer } from "relkit/runtime";
import { blockInspectionPath } from "../../../src/supervisor/proxy-inspection.js";
import { createSupervisorProxy } from "../../../src/supervisor/proxy.js";

/** What the worker's handler saw. */
export interface SeenRequest {
  readonly method: string;
  readonly path: string;
  readonly host: string | null;
  readonly contentLength: string | null;
  readonly text: string | null;
}

/** One raw exchange: every status line, the first head and body, and whether the socket closed. */
export interface RawAnswer {
  readonly statuses: readonly string[];
  readonly head: string;
  readonly body: string;
  readonly closed: boolean;
}

/** `Host` values that are not a host with an optional port. */
export const MALFORMED_HOSTS = [
  "a b",
  "x:abc",
  "%",
  "[",
  "user@x",
  "x:99999",
  "x#y",
  "x/a1?name=q#",
  "xn--",
];

/** Requests that declare a body on a method whose body the front does not forward. */
export const BODIED_READS = [
  ["GET", "Content-Length: 5\r\n\r\nabcde"],
  ["HEAD", "Content-Length: 5\r\n\r\nabcde"],
  ["OPTIONS", "Content-Length: 2\r\n\r\n{}"],
  ["GET", "Transfer-Encoding: chunked\r\n\r\n5\r\nabcde\r\n0\r\n\r\n"],
] as const;

/**
 * Starts the reporting worker and a front with the inspection block; `/throw` makes the front's
 * own interception throw, outside any application error mapping.
 * @returns The front's port and a stop function.
 */
export async function startFront(): Promise<{ port: number; stop: () => Promise<void> }> {
  const runtime = await loadRuntimeAdapter(
    typeof process.versions.bun === "string" ? "bun" : "node",
  );
  const upstream: RuntimeServer = await runtime.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/slow") return slowBody();
      return Response.json({
        method: request.method,
        path: `${url.pathname}${url.search}`,
        host: request.headers.get("host"),
        contentLength: request.headers.get("content-length"),
        text: request.body === null ? null : await request.text(),
      } satisfies SeenRequest);
    },
  });
  const proxy = createSupervisorProxy({
    port: 0,
    intercept: (request) => {
      if (new URL(request.url).pathname === "/throw")
        throw new Error(`thrown at ${import.meta.url}`);
      return blockInspectionPath(request);
    },
  });
  await proxy.listen();
  proxy.switchTarget({ token: { sourceToken: 1, generationToken: 1 }, port: upstream.port });
  return {
    port: proxy.port,
    stop: async () => {
      await proxy.stop();
      await upstream.stop(true);
    },
  };
}

/**
 * A body whose first part is sent at once and whose end comes 300 ms later.
 * @returns The streaming response.
 */
function slowBody(): Response {
  let step = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (step++ > 0) await new Promise((resolve) => setTimeout(resolve, 300));
      controller.enqueue(new TextEncoder().encode(`part ${step}\n`.repeat(64)));
      if (step === 3) controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "text/plain" } });
}

/**
 * Reads a response's head, then leaves without reading the body, as a client that only wanted
 * the status does.
 * @param port - Front port.
 * @param target - Request target.
 * @returns After the connection was destroyed.
 */
export async function leaveAfterHead(port: number, target: string): Promise<void> {
  const socket = connect(port, "127.0.0.1");
  socket.once("error", () => undefined);
  socket.once("connect", () => socket.write(plainRequest(port, target)));
  await new Promise<void>((resolve) => {
    socket.once("data", () => resolve());
    socket.once("close", () => resolve());
  });
  socket.destroy();
}

/**
 * Writes raw bytes on a new connection and collects what comes back until the server closes the
 * connection or the wait ends.
 * @param port - Front port.
 * @param bytes - Exact request bytes.
 * @param waitMs - Longest wait for the server to close.
 * @returns The answers read.
 */
export async function rawExchange(port: number, bytes: string, waitMs = 2_000): Promise<RawAnswer> {
  const socket = connect(port, "127.0.0.1");
  let raw = "";
  let closed = false;
  socket.on("data", (chunk: Buffer) => (raw += chunk.toString("latin1")));
  socket.once("error", () => undefined);
  socket.once("connect", () => socket.write(Buffer.from(bytes, "latin1")));
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      socket.destroy();
      resolve();
    }, waitMs);
    socket.once("close", () => {
      closed = true;
      clearTimeout(timer);
      resolve();
    });
  });
  const end = raw.indexOf("\r\n\r\n");
  const head = end === -1 ? raw : raw.slice(0, end);
  let body = end === -1 ? "" : raw.slice(end + 4);
  if (/^transfer-encoding: chunked/im.test(head)) body = decodeChunked(body);
  // A pipelined answer starts right after the previous body, not at the start of a line.
  const statuses = [...raw.matchAll(/HTTP\/1\.[01] (\d{3}) /g)].map((match) => match[1]!);
  return { statuses, head, body, closed };
}

/**
 * A plain request line with headers, closing the connection after the answer.
 * @param port - Front port, named by `Host`.
 * @param target - Request target.
 * @param method - Request method.
 * @returns The request bytes up to the end of the head.
 */
export function plainRequest(port: number, target: string, method = "GET"): string {
  return `${method} ${target} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`;
}

/**
 * Reads a response header from a raw head.
 * @param head - Raw response head.
 * @param name - Lowercase header name.
 * @returns The value, or undefined.
 */
export function headerOf(head: string, name: string): string | undefined {
  return new RegExp(`^${name}: *(.*)$`, "im").exec(head)?.[1]?.trim();
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
