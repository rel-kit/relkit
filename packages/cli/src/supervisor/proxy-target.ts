/**
 * Settles the URL the development front judges and forwards, the same way on Bun and Node. Bun
 * builds `request.url` by joining `Host` to the request target, so a `Host` that carries a path
 * changes the route and a malformed one leaves a URL that does not parse; and Bun's `fetch`
 * collapses a leading `//` of the path it sends, so the path the front judged would not be the
 * path the worker serves (27.1).
 */
import { problemResponse } from "relkit/contracts";

/** A host name, IPv4 or bracketed IPv6 address, with an optional port of up to five digits. */
const AUTHORITY =
  /^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_])?\.?)(?::(\d{1,5}))?$/;

/**
 * Tells whether a `Host` value is a host with an optional port, and nothing else.
 * @param host - `Host` header value.
 * @returns False for a value with a path, query, fragment, user information, space or a port
 * outside 0 to 65535, or one the URL parser refuses.
 */
export function isValidAuthority(host: string): boolean {
  const match = AUTHORITY.exec(host);
  if (match === null) return false;
  if (match[1] !== undefined && Number(match[1]) > 65_535) return false;
  return URL.canParse(`http://${host}/`);
}

/**
 * Gives the request the URL the front judges and forwards.
 * @param request - Request as the listener built it.
 * @param listenerAuthority - The front's own `host:port`, used when the client sent no `Host` (as
 * HTTP/1.0 allows) or an empty one.
 * @returns The same request, its `url` replaced when it differed; a bare 400 for a malformed
 * `Host` or target; or the front's 404 for a path starting with `//`, which no route serves.
 */
export function publicRequest(request: Request, listenerAuthority: string): Request | Response {
  const host = request.headers.get("host");
  if (host !== null && host !== "" && !isValidAuthority(host))
    return new Response(null, { status: 400, headers: { connection: "close" } });
  let url: URL;
  try {
    url = new URL(request.url, `http://${listenerAuthority}`);
    if (host === null || host === "")
      url = new URL(`${url.pathname}${url.search}`, `http://${listenerAuthority}`);
  } catch {
    return new Response(null, { status: 400, headers: { connection: "close" } });
  }
  if (url.pathname.startsWith("//")) return notFoundResponse();
  if (url.href !== request.url)
    Object.defineProperty(request, "url", { value: url.href, configurable: true });
  return request;
}

/**
 * Answers a path the front refuses the way the application answers an unknown path.
 * @returns A 404 Problem whose `requestId` is the one its `x-request-id` header names.
 */
export function notFoundResponse(): Response {
  const requestId = `request-${crypto.randomUUID()}`;
  return problemResponse({
    status: 404,
    code: "not-found",
    detail: "No route matches this request.",
    requestId,
    headers: { "x-request-id": requestId, "cache-control": "no-store" },
  });
}

/**
 * Answers a failure outside any application error mapping without internal detail.
 * @returns A 500 Problem with a request ID, never the runtime's own error page.
 */
export function internalErrorResponse(): Response {
  const requestId = `request-${crypto.randomUUID()}`;
  return problemResponse({
    status: 500,
    code: "internal-error",
    detail: "The request failed unexpectedly.",
    requestId,
    headers: { "x-request-id": requestId, "cache-control": "no-store" },
  });
}
