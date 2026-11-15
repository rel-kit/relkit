import type { SupervisorDrainLease } from "./drain.types.js";
import { hostPreservingFetch } from "./proxy-node-client.js";
import type { ActiveSupervisorProxyTarget } from "./proxy.types.js";

// `content-length` is kept: the worker then applies its body limit from the header, as in production.
const HOP_BY_HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
] as const;

/** Forwards native request bytes and public Host/Origin without buffering. @param request - Incoming request.
 * @param target - Synchronously pinned private generation. @param fetcher - Native fetch capability.
 * @param lease - Optional generation signal. @param ownedSignal - Optional request-scope cancellation.
 * @returns Native upstream headers/body; the owning service retains/releases any supplied lease. */
export function forwardProxyRequest(
  request: Request,
  target: ActiveSupervisorProxyTarget,
  fetcher: typeof fetch = forwardingFetch,
  lease?: SupervisorDrainLease,
  ownedSignal?: AbortSignal,
): Promise<Response> {
  const url = new URL(request.url);
  url.protocol = "http:";
  url.hostname = target.hostname;
  url.port = String(target.port);
  const init: RequestInit = {
    method: request.method,
    headers: forwardedHeaders(request),
    redirect: "manual",
    signal: AbortSignal.any([
      request.signal,
      ...(lease === undefined ? [] : [lease.signal]),
      ...(ownedSignal === undefined ? [] : [ownedSignal]),
    ]),
  };
  let bodyEnded = true;
  // Re-stream decoded bytes: Bun 1.3.10's native chunked passthrough can produce empty 400s.
  if (request.method !== "GET" && request.method !== "HEAD" && declaresBody(request)) {
    bodyEnded = false;
    const progress = new TransformStream<Uint8Array, Uint8Array>({
      flush: () => {
        bodyEnded = true;
      },
    });
    init.body = request.body.pipeThrough(progress);
    // Node's fetch refuses a streamed body without it; Bun ignores it.
    Object.assign(init, { duplex: "half" });
    // When the worker answers before the body was sent, Bun's fetch stops sending it but still
    // pools the connection, so the worker reads the next request as body and answers a bare 400.
    // A connection that carried a request body is therefore never reused.
    init.keepalive = false;
  }
  return fetcher(url, init).then((response) => {
    if (!bodyEnded) earlyAnswers.add(response);
    return response;
  });
}

const earlyAnswers = new WeakSet<Response>();

/** Tells whether the worker answered before the client's request body had ended.
 * @param response - Upstream response returned by {@link forwardProxyRequest}.
 * @returns True when the client connection must close after this response, since the rest of
 * its body was never read. */
export function answeredBeforeBody(response: Response): boolean {
  return earlyAnswers.has(response);
}

/** Tells whether the client sent a request body, so the proxy never invents one (RK-41): only
 * `Transfer-Encoding` or a `Content-Length` above zero declare one, whatever stream the listener
 * attached. @param request - Incoming request. @returns True when the body must be forwarded. */
function declaresBody(
  request: Request,
): request is Request & { readonly body: ReadableStream<Uint8Array> } {
  if (request.body === null) return false;
  if (request.headers.has("transfer-encoding")) return true;
  return Number(request.headers.get("content-length") ?? 0) > 0;
}

/** Builds the established drain rejection. @returns Uncached JSON503 response. */
export function drainResponse(): Response {
  return new Response(JSON.stringify({ error: "RelKit generation is draining." }), {
    status: 503,
    headers: { "cache-control": "no-store", "content-type": "application/json" },
  });
}

/** Copies end-to-end headers while preserving public authority. @param request - Native incoming request.
 * @returns Headers excluding connection-declared and standard hop-by-hop fields. */
function forwardedHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  const connection = headers.get("connection");
  for (const name of connection?.split(",") ?? []) headers.delete(name.trim());
  for (const name of HOP_BY_HOP_HEADERS) headers.delete(name);
  // The worker derives its request URL from Host. Retain the public authority so origin
  // checks see the browser's URL rather than the private child port. Only Host carries it:
  // the worker trusts no client-supplied forwarding header for the authority.
  headers.set("host", new URL(request.url).host);
  return headers;
}

/** The upstream client for this runtime: Bun's `fetch` keeps `Host`; Node's does not. */
export const forwardingFetch: typeof fetch =
  typeof process.versions.bun === "string"
    ? fetch
    : Object.assign(
        (input: URL | string | Request, init?: RequestInit) =>
          hostPreservingFetch(input instanceof Request ? input.url : input, init),
        { preconnect: fetch.preconnect },
      );
