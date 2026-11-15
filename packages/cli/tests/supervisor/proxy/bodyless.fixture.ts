/**
 * RK-41 through the development proxy: a worker on this runtime's adapter that reports whether
 * its handler received a body and the framing headers it saw, behind a real supervisor proxy, and
 * a raw client that frames each request exactly as a test gives it. Shared by the Bun and Node
 * proxy suites.
 */
import { connect } from "node:net";
import { loadRuntimeAdapter, type RuntimeServer } from "relkit/runtime";
import { createSupervisorProxy } from "../../../src/supervisor/proxy.js";

/** What the worker's handler saw. */
export interface SeenRequest {
  readonly method: string;
  readonly bodyNull: boolean;
  readonly contentLength: string | null;
  readonly transferEncoding: string | null;
  readonly text: string | null;
}

/** A raw request head, its body bytes, and what the handler must see. */
export interface BodylessCase {
  readonly name: string;
  readonly head: string;
  readonly body: string;
  readonly expected: Partial<SeenRequest>;
}

const NONE = { bodyNull: true, transferEncoding: null, text: null } as const;

/** Requests without a body, with an empty declared one, and with real bodies of each framing. */
export const BODYLESS_CASES: readonly BodylessCase[] = [
  // Bun's fetch states `Content-Length: 0` for a bodiless POST; that still declares no body.
  { name: "POST without a body", head: "POST", body: "", expected: NONE },
  {
    name: "POST with Content-Length: 0",
    head: "POST\r\nContent-Length: 0",
    body: "",
    expected: { ...NONE, contentLength: "0" },
  },
  { name: "DELETE without a body", head: "DELETE", body: "", expected: NONE },
  {
    name: "PATCH with a declared body",
    head: "PATCH\r\nContent-Length: 5",
    body: "hello",
    expected: { bodyNull: false, contentLength: "5", transferEncoding: null, text: "hello" },
  },
  {
    name: "POST with a chunked body",
    head: "POST\r\nTransfer-Encoding: chunked",
    body: "5\r\nhello\r\n0\r\n\r\n",
    expected: { bodyNull: false, transferEncoding: "chunked", text: "hello" },
  },
];

/**
 * Starts the reporting worker and a proxy in front of it.
 * @returns The proxy port and a stop function.
 */
export async function startBodylessProxy(): Promise<{ port: number; stop: () => Promise<void> }> {
  const runtime = await loadRuntimeAdapter(
    typeof process.versions.bun === "string" ? "bun" : "node",
  );
  const upstream: RuntimeServer = await runtime.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const bodyNull = request.body === null;
      return Response.json({
        method: request.method,
        bodyNull,
        contentLength: request.headers.get("content-length"),
        transferEncoding: request.headers.get("transfer-encoding"),
        text: bodyNull ? null : await request.text(),
      } satisfies SeenRequest);
    },
  });
  const proxy = createSupervisorProxy({ port: 0 });
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
 * Sends one request framed exactly as the case gives it, on its own connection.
 * @param port - Proxy port.
 * @param testCase - Method line suffix and headers, and body bytes.
 * @returns What the worker's handler saw.
 */
export async function bodylessExchange(port: number, testCase: BodylessCase): Promise<SeenRequest> {
  const [method, ...headers] = testCase.head.split("\r\n");
  const socket = connect(port, "127.0.0.1");
  let raw = "";
  socket.on("data", (chunk: Buffer) => (raw += chunk.toString()));
  socket.write(
    `${method} /body HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: http://127.0.0.1:${port}\r\n` +
      `${headers.map((header) => `${header}\r\n`).join("")}Connection: close\r\n\r\n${testCase.body}`,
  );
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => socket.destroy(), 3_000);
    socket.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("error", () => undefined);
  });
  const head = raw.slice(0, raw.indexOf("\r\n\r\n"));
  let text = raw.slice(head.length + 4);
  if (/transfer-encoding: chunked/i.test(head)) text = decodeChunked(text);
  try {
    return JSON.parse(text) as SeenRequest;
  } catch {
    throw new Error(`Unexpected answer: ${JSON.stringify(raw)}`);
  }
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
