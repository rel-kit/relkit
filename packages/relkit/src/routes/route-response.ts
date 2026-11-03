/** Applies a route's `response` settings to a mapped success response, for the runtime and tests. */
import type { RouteCookie, RouteResponseInit } from "./route-response.types.js";

/**
 * Rebuilds a response with a route's status, headers and cookies.
 * @param response - Mapped success response.
 * @param init - Settings returned by the route's `response` option.
 * @returns The rebuilt response; invalid settings throw.
 */
export function applyRouteResponse(response: Response, init: unknown): Response {
  if (!isRecord(init)) throw new TypeError("A route response option must return an object.");
  const { status, headers, cookies } = init as RouteResponseInit;
  if (
    status !== undefined &&
    (!Number.isInteger(status) || status < 200 || status > 299 || status === 205)
  )
    throw new TypeError("A route response status must be a 2xx status other than 205.");
  const merged = new Headers(response.headers);
  for (const [name, value] of Object.entries(headers ?? {})) merged.set(name, value);
  for (const cookie of cookies ?? []) {
    const { name, value, ...options } = cookie;
    merged.append("set-cookie", serializeCookie(name, value, options));
  }
  const nextStatus = status ?? response.status;
  return new Response(nextStatus === 204 ? null : response.body, {
    status: nextStatus,
    headers: merged,
  });
}

/** Whether a value is an object or function whose fields can be read. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** Serializes one `Set-Cookie` value; the cookie value is percent-encoded. */
function serializeCookie(
  name: string,
  value: string,
  options: Omit<RouteCookie, "name" | "value">,
): string {
  if (!COOKIE_NAME.test(name)) throw new TypeError(`Invalid cookie name "${name}".`);
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.domain !== undefined) parts.push(`Domain=${options.domain}`);
  if (options.path !== undefined) parts.push(`Path=${options.path}`);
  if (options.expires !== undefined) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly === true) parts.push("HttpOnly");
  if (options.secure === true || options.sameSite === "None") parts.push("Secure");
  if (options.sameSite !== undefined) parts.push(`SameSite=${options.sameSite}`);
  return parts.join("; ");
}
