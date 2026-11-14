/**
 * RK-01 reproduction through the development proxy: a worker that answers before reading the
 * body, and a raw client that sends the body after the headers and then a second request on the
 * same connection. Shared by the Bun and Node proxy suites.
 */
import { connect } from "node:net";

/** Requests the fake worker saw on its body-reading path. */
export interface EchoRecord {
  readonly length: string | null;
  readonly bytes: number;
}

/**
 * Answers like a worker that rejects `POST /write` before reading its body.
 * @param request - Request forwarded by the proxy.
 * @param seen - Receives each `/echo` request's declared and read length.
 * @returns 200 for `/ok`, the read length for `/echo`, and an early 403 otherwise.
 */
export async function earlyWorker(request: Request, seen: EchoRecord[]): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === "/ok") return Response.json({ ok: true }, { headers: { "x-request-id": "r" } });
  if (path === "/echo") {
    const bytes = (await request.arrayBuffer()).byteLength;
    seen.push({ length: request.headers.get("content-length"), bytes });
    return Response.json({ bytes });
  }
  return new Response("denied", { status: 403 });
}

/**
 * Sends a cross-origin POST whose body arrives after its headers, then `GET /ok` on the socket.
 * @param port - Proxy port.
 * @param framing - Whether the body is sent with `Content-Length` or chunked.
 * @returns The raw bytes the proxy wrote back.
 */
export async function lateBodyExchange(
  port: number,
  framing: "length" | "chunked",
): Promise<string> {
  const body = JSON.stringify({ name: "x".repeat(300) });
  const socket = connect(port, "127.0.0.1");
  let received = "";
  socket.on("data", (data) => (received += data.toString()));
  socket.on("error", () => undefined);
  await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  socket.write(
    `POST /write HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: http://evil.test\r\n` +
      "Content-Type: application/json\r\n" +
      (framing === "length"
        ? `Content-Length: ${body.length}\r\n\r\n`
        : "Transfer-Encoding: chunked\r\n\r\n"),
  );
  await wait(30);
  socket.write(framing === "length" ? body : `${body.length.toString(16)}\r\n${body}\r\n0\r\n\r\n`);
  await wait(10);
  socket.write(`GET /ok HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`);
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const second = received.indexOf("HTTP/1.1 ", 1);
    if (second > 0 && received.indexOf('{"ok":true}', second) > 0) break;
    await wait(10);
  }
  socket.destroy();
  return received;
}

/**
 * Lists the status codes of the responses in a raw exchange.
 * @param raw - Bytes written by the server.
 * @returns Status codes in order.
 */
export function statusCodes(raw: string): string[] {
  return [...raw.matchAll(/HTTP\/1\.1 (\d{3})/g)].map((match) => match[1]!);
}

/** The audit's client: Node's fetch sends the body after the headers, so the worker can answer
 * first. It prints `<first>><second>:<x-request-id>` for each attempt. */
export const NODE_FETCH_CLIENT = `
const [port, count] = process.argv.slice(1).map(Number);
const statuses = [];
for (let attempt = 0; attempt < count; attempt++) {
  const denied = await fetch("http://127.0.0.1:" + port + "/write", {
    method: "POST",
    headers: { origin: "http://evil.test", "content-type": "application/json" },
    body: JSON.stringify({ attempt, name: "x".repeat(2000) }),
  });
  await denied.arrayBuffer();
  const next = await fetch("http://127.0.0.1:" + port + "/ok");
  await next.arrayBuffer();
  statuses.push(denied.status + ">" + next.status + ":" + next.headers.get("x-request-id"));
}
console.log(JSON.stringify(statuses));
`;
