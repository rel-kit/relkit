import type { Context } from "hono";
import type { MappingValue } from "./request-mapping.js";
import type { HttpRouteRequest } from "./materialize-routes.js";

export function requestFromContext(context: Context, pathPattern?: string): HttpRouteRequest {
  const query: Record<string, MappingValue> = {};
  const headers: Record<string, MappingValue> = {};
  for (const [key, value] of new URL(context.req.url).searchParams.entries()) {
    const previous = query[key];
    query[key] =
      previous === undefined
        ? value
        : Array.isArray(previous)
          ? [...previous, value]
          : [previous, value];
  }
  for (const [key, value] of context.req.raw.headers.entries()) {
    // ponytail: Fetch Headers combines repeated scalar values; raw server headers are needed to distinguish CSV values.
    const values = value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    headers[key] = values.length > 1 ? values : value;
  }
  return Object.freeze({
    request: context.req.raw,
    ...(pathPattern === undefined ? {} : { pathPattern }),
    params: Object.freeze({ ...context.req.param() }),
    query: Object.freeze(query),
    headers: Object.freeze(headers),
  });
}
