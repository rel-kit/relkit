import type { Context } from "hono";
import type {
  FunctionRequest,
  FunctionRequestMetadata,
  FunctionRequestValue,
} from "@zsys/contracts";
import { createFunctionRequest } from "@zsys/contracts";
import type { MappingValue } from "./request-mapping.js";
import type { HttpRouteRequest } from "./materialize-routes.js";

export function requestFromContext(
  context: Context,
  pathPattern?: string,
  metadata: Omit<FunctionRequestMetadata, "kind" | "pathPattern"> = {},
): HttpRouteRequest {
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
  const normalizedPathPattern = pathPattern;
  return Object.freeze({
    request: context.req.raw,
    ...(normalizedPathPattern === undefined ? {} : { pathPattern: normalizedPathPattern }),
    params,
    query: Object.freeze(query),
    headers: Object.freeze(headers),
    metadata: Object.freeze({
      kind: "http" as const,
      ...(normalizedPathPattern === undefined ? {} : { pathPattern: normalizedPathPattern }),
      ...metadata,
    }),
  });
}

export function functionRequestFromRoute(route: HttpRouteRequest): FunctionRequest {
  return createFunctionRequest(route.request.clone(), {
    params: route.params,
    query: route.query,
    headers: route.headers,
    metadata: route.metadata,
  });
}

function materializeParams(context: Context, pathPattern: string | undefined) {
  const params: Record<string, FunctionRequestValue> = {};
  for (const [name, value] of Object.entries(context.req.param())) {
    const token = catchAllToken(pathPattern, name);
    params[name] = token === undefined ? value : catchAllValues(context.req.url, token);
  }
  return Object.freeze(params);
}

function catchAllToken(pathPattern: string | undefined, name: string): number | undefined {
  const token = pathPattern?.split("/").findIndex((segment) => {
    return segment === `*${name}` || segment === `*${name}?`;
  });
  return token === undefined || token < 0 ? undefined : token;
}

function catchAllValues(url: string, token: number): readonly string[] {
  const segments = new URL(url).pathname.split("/").slice(token);
  return Object.freeze(segments.filter((segment) => segment !== "").map(decode));
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function append(target: Record<string, MappingValue>, key: string, value: string): void {
  const previous = target[key];
  target[key] =
    previous === undefined
      ? value
      : Object.freeze(Array.isArray(previous) ? [...previous, value] : [previous, value]);
}
