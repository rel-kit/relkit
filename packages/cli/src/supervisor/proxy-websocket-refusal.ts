/**
 * The answer the development proxy gives when the worker does not accept a WebSocket upgrade.
 * Node's upstream client (`ws`) reports the worker's own answer, which the proxy repeats. Bun's
 * client reports only that the handshake failed, so the proxy answers what it can tell itself: a
 * foreign `Origin` is refused as the worker refuses it, anything else is a 502 Problem.
 */
import type { IncomingMessage } from "node:http";
import { problemResponse } from "relkit/contracts";
import type { WebSocket as NodeWebSocket } from "ws";

/** What the worker answered instead of switching protocols. */
interface UpstreamRefusal {
  readonly status: number;
  readonly headers: Headers;
  readonly body: Uint8Array<ArrayBuffer>;
}

/** Largest refusal body the proxy repeats; a longer one is cut there. */
const REFUSAL_BODY_BYTES = 64 * 1024;
/** Worker headers the repeated refusal keeps. */
const REFUSAL_HEADERS = ["cache-control", "content-type", "x-content-type-options", "x-request-id"];
const refusals = new WeakMap<object, Promise<UpstreamRefusal>>();

/**
 * Keeps the worker's answer when it refuses a Node upstream's handshake, then ends the handshake.
 * @param socket - Upstream `ws` client, before its handshake completes.
 * @returns Nothing; the answer is kept for {@link refusedUpgrade}.
 */
export function keepUpstreamRefusal(socket: NodeWebSocket): void {
  socket.on("unexpected-response", (_request, response) => {
    refusals.set(
      socket,
      readRefusal(response).finally(() => socket.terminate()),
    );
  });
}

/**
 * Builds the answer to a downstream upgrade that the upstream did not accept.
 * @param request - Downstream upgrade request.
 * @param upstream - Upstream client whose handshake failed.
 * @returns The worker's own answer when the client kept it; otherwise a Problem: 403
 * `origin-denied` for a foreign or opaque `Origin`, 502 `upstream-unavailable` for anything else.
 */
export async function refusedUpgrade(request: Request, upstream: object): Promise<Response> {
  const refusal = await refusals.get(upstream)?.catch(() => undefined);
  if (refusal !== undefined) {
    const headers = new Headers();
    for (const name of REFUSAL_HEADERS) {
      const value = refusal.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    return new Response(refusal.body, { status: refusal.status, headers });
  }
  const requestId = `request-${crypto.randomUUID()}`;
  const origin = request.headers.get("origin");
  const foreign = origin !== null && origin !== new URL(request.url).origin;
  return problemResponse({
    status: foreign ? 403 : 502,
    code: foreign ? "origin-denied" : "upstream-unavailable",
    detail: foreign
      ? "The request was rejected."
      : "The application did not accept the WebSocket upgrade.",
    requestId,
    headers: { "x-request-id": requestId, "cache-control": "no-store" },
  });
}

/**
 * Reads the refusal's status, headers and up to {@link REFUSAL_BODY_BYTES} of its body.
 * @param response - The worker's non-101 answer.
 * @returns The refusal once its body ended or reached the limit.
 */
function readRefusal(response: IncomingMessage): Promise<UpstreamRefusal> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(response.headers))
    if (typeof value === "string") headers.set(name, value);
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const finish = (): void => {
      response.removeAllListeners("data");
      const body = new Uint8Array(Math.min(bytes, REFUSAL_BODY_BYTES));
      let offset = 0;
      for (const chunk of chunks) {
        const part = chunk.subarray(0, body.byteLength - offset);
        body.set(part, offset);
        offset += part.byteLength;
      }
      resolve({ status: response.statusCode ?? 502, headers, body });
    };
    response.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      bytes += chunk.byteLength;
      if (bytes >= REFUSAL_BODY_BYTES) finish();
    });
    response.once("end", finish);
    response.once("error", finish);
    response.once("close", finish);
  });
}
