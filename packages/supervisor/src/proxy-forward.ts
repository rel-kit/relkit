import type { SupervisorDrainLease } from "./drain.types.js";
import type { ActiveSupervisorProxyTarget } from "./proxy.types.js";

const HOP_BY_HOP_HEADERS = [
  "connection",
  "content-length",
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
  fetcher: typeof fetch = fetch,
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
  if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;
  return fetcher(url, init);
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
  // Bun derives the upstream request URL from Host. Retain the public authority
  // so origin checks see the browser's URL rather than the private child port.
  headers.set("host", new URL(request.url).host);
  return headers;
}
