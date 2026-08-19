import type { SupervisorDrainLease } from "./drain-types.js";
import type { ActiveSupervisorProxyTarget } from "./proxy.js";

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

export function forwardProxyRequest(
  request: Request,
  target: ActiveSupervisorProxyTarget,
  fetcher: typeof fetch = fetch,
  lease?: SupervisorDrainLease,
): Promise<Response> {
  const url = new URL(request.url);
  url.protocol = "http:";
  url.hostname = target.hostname;
  url.port = String(target.port);
  const init: RequestInit = {
    method: request.method,
    headers: forwardedHeaders(request.headers),
    redirect: "manual",
    signal: lease === undefined ? request.signal : AbortSignal.any([request.signal, lease.signal]),
  };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;
  return fetcher(url, init);
}

export function drainResponse(): Response {
  return new Response(JSON.stringify({ error: "ZSys generation is draining." }), {
    status: 503,
    headers: { "cache-control": "no-store", "content-type": "application/json" },
  });
}

function forwardedHeaders(source: Headers): Headers {
  const headers = new Headers(source);
  const connection = headers.get("connection");
  for (const name of connection?.split(",") ?? []) headers.delete(name.trim());
  for (const name of HOP_BY_HOP_HEADERS) headers.delete(name);
  return headers;
}
