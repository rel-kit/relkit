/**
 * Settles a request's URL on Bun the way Node's adapter does. Bun builds `request.url` by joining
 * `Host` to the request target without checking either, so a `Host` that carries a path changes
 * the route, a malformed one leaves a URL that does not parse, and a request without one (HTTP/1.0
 * allows it) has a relative URL; every later `new URL(request.url)` would then throw outside the
 * application's error mapping.
 */
import { problemResponse } from "../../contracts/problem-details.js";

/**
 * A host name, IPv4 or bracketed IPv6 address, with an optional port of up to five digits: the
 * characters Hono's Node server accepts in `Host`, so both adapters refuse the same values (save
 * the few each runtime's URL parser judges differently, such as `xn--`).
 */
const AUTHORITY = /^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9._-]+)(?::(\d{1,5}))?$/;

/**
 * Gives a request an absolute URL built from a valid `Host`, or refuses it as Node's adapter does.
 * @param request - Request as `Bun.serve` built it.
 * @param listenerAuthority - The listener's own `host:port`, used when the client sent no `Host`
 * or an empty one.
 * @returns The same request, its `url` replaced when it differed, or a bare 400 for a `Host`
 * that is not a host with an optional port, or a target that does not form a URL.
 */
export function acceptedRequest(request: Request, listenerAuthority: string): Request | Response {
  const host = request.headers.get("host");
  if (host !== null && host !== "" && !isValidAuthority(host)) return badRequest();
  let url: URL;
  try {
    url = new URL(request.url, `http://${listenerAuthority}`);
  } catch {
    return badRequest();
  }
  if (url.href !== request.url)
    Object.defineProperty(request, "url", { value: url.href, configurable: true });
  return request;
}

/**
 * Answers a failure that escaped the application's own error mapping without internal detail,
 * never Bun's development error page.
 * @returns A 500 Problem with a request ID.
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

/**
 * Tells whether a `Host` value is a host with an optional port, and nothing else.
 * @param host - `Host` header value.
 * @returns False for a path, query, fragment, user information, space, a port above 65535, or a
 * value the URL parser refuses.
 */
function isValidAuthority(host: string): boolean {
  const match = AUTHORITY.exec(host);
  if (match === null) return false;
  if (match[1] !== undefined && Number(match[1]) > 65_535) return false;
  return URL.canParse(`http://${host}/`);
}

/** @returns The bare 400 Node's adapter gives a malformed request. */
function badRequest(): Response {
  return new Response(null, { status: 400, headers: { connection: "close" } });
}
