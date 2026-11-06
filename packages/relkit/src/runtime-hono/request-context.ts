import type { Context } from "hono";
import type { HttpRouteRequest } from "./materialize-routes.js";
import type { MappingValue } from "./request-mapping.js";

/** Materializes validated request values and routing parameters from Hono.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param pathPattern - Registered route path used to resolve catch-all parameters.
 * @returns A frozen route request with raw request, parameters, repeated values and validated data.
 */
export function requestFromContext(context: Context, pathPattern?: string): HttpRouteRequest {
  const query: Record<string, MappingValue> = {};
  const headers: Record<string, MappingValue> = {};
  for (const [key, value] of new URL(context.req.url).searchParams.entries()) {
    append(query, key, value);
  }
  for (const [key, value] of context.req.raw.headers.entries()) {
    // ponytail: Fetch Headers combines repeated scalar values; raw server headers are needed to distinguish CSV values.
    const values = value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    headers[key] = values.length > 1 ? Object.freeze(values) : value;
  }
  const params = materializeParams(context, pathPattern);
  return Object.freeze({
    request: context.req.raw,
    ...(pathPattern === undefined ? {} : { pathPattern }),
    params,
    query: Object.freeze(query),
    headers: Object.freeze(headers),
    validated: validatedData(context),
  });
}

/** Combines Hono route parameters with declared catch-all path captures.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param pathPattern - Registered route path used to resolve catch-all parameters.
 * @returns Frozen named parameters with catch-all captures represented as ordered arrays.
 */
function materializeParams(context: Context, pathPattern: string | undefined) {
  const params: Record<string, MappingValue> = {};
  for (const [name, value] of Object.entries(context.req.param())) {
    const token = catchAllToken(pathPattern, name);
    params[name] = token === undefined ? value : catchAllValues(context.req.url, token);
  }
  return Object.freeze(params);
}

/** Reads validated Hono request data for supported mapping sources.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @returns A frozen map containing the validation targets Hono has populated.
 */
function validatedData(context: Context): Readonly<Record<string, unknown>> {
  const request = context.req as unknown as { valid: (target: string) => unknown };
  return Object.freeze(
    Object.fromEntries(
      ["param", "query", "header", "cookie", "json", "form"].flatMap((target) => {
        const value = request.valid(target);
        return value === undefined ? [] : [[target, value]];
      }),
    ),
  );
}

/** Locates the catch-all segment corresponding to a declared parameter.
 * @param pathPattern - Registered route path used to resolve catch-all parameters.
 * @param name - Declared field, header, stream or configuration key.
 * @returns The catch-all segment index, or undefined when the named token is absent.
 */
function catchAllToken(pathPattern: string | undefined, name: string): number | undefined {
  const token = pathPattern?.split("/").findIndex((segment) => {
    return segment === `*${name}` || segment === `*${name}?`;
  });
  return token === undefined || token < 0 ? undefined : token;
}

/** Decodes the URL path segments captured by a catch-all token.
 * @param url - Request URL supplying decoded path segments.
 * @param token - Declared catch-all token or CSRF value checked by policy.
 * @returns Frozen decoded nonempty path segments captured from the token onward.
 */
function catchAllValues(url: string, token: number): readonly string[] {
  const segments = new URL(url).pathname.split("/").slice(token);
  return Object.freeze(segments.filter((segment) => segment !== "").map(decode));
}

/** Decodes a URL component while preserving malformed input for later validation.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns The decoded component, or its original text when percent encoding is malformed.
 */
function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Appends repeated request values without dropping previously observed values.
 * @param target - Output object accumulating normalized request values.
 * @param key - Declared property or field key.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Nothing; the requested update is applied to the owned state.
 */
function append(target: Record<string, MappingValue>, key: string, value: string): void {
  const previous = target[key];
  target[key] =
    previous === undefined
      ? value
      : Object.freeze(Array.isArray(previous) ? [...previous, value] : [previous, value]);
}
