import { API_VERSION, canonicalJson } from "@zsys/contracts";
import type { Hono } from "hono";
import { installObservabilityEndpoints, INSPECTOR_API_PROTOCOL } from "./observability.js";
import { InspectorGraphError } from "./graph.js";
import { InspectorRuntimeError } from "./runtime.js";
import {
  InspectorQueryError,
  type InspectorMode,
  type ResolvedActiveGeneration,
} from "./shared.js";
import type { InspectorApiOptions } from "./router.js";

export class InspectorEndpointConfigurationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "InspectorEndpointConfigurationError";
  }
}

export class InspectorEndpointError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = "InspectorEndpointError";
  }
}

export function validateConfiguration(
  mode: InspectorMode,
  enabled: boolean,
  options: InspectorApiOptions,
): void {
  if (!(mode === "development" || mode === "test" || mode === "production"))
    throw new InspectorEndpointConfigurationError("mode is invalid");
  if (
    mode === "production" &&
    enabled &&
    options.bearerToken === undefined &&
    options.authorize === undefined
  )
    throw new InspectorEndpointConfigurationError(
      "Production inspector endpoints require bearerToken or authorize protection.",
    );
  if (options.bearerToken !== undefined && options.bearerToken.trim().length === 0)
    throw new InspectorEndpointConfigurationError("bearerToken must not be empty");
  if ((options.query === undefined) !== (options.stream === undefined))
    throw new InspectorEndpointConfigurationError("query and stream must be configured together");
  if (
    options.maxPreviewBytes !== undefined &&
    (!Number.isSafeInteger(options.maxPreviewBytes) || options.maxPreviewBytes < 1)
  ) {
    throw new InspectorEndpointConfigurationError("maxPreviewBytes must be a positive integer");
  }
}

export async function authorized(request: Request, options: InspectorApiOptions): Promise<boolean> {
  if (options.authorize !== undefined) {
    try {
      if (await options.authorize(request)) return true;
    } catch {
      return false;
    }
    if (options.bearerToken === undefined) return false;
  }
  return (
    options.bearerToken === undefined ||
    request.headers.get("authorization") === `Bearer ${options.bearerToken}`
  );
}

export function negotiate(request: Request): void {
  const url = new URL(request.url);
  negotiateHeaders(request);
  const requested = [url.searchParams.get("version")].filter(
    (value): value is string => value !== null,
  );
  if (requested.some((value) => !/^\d+$/.test(value) || Number(value) !== API_VERSION))
    throw new InspectorEndpointError("ZSYS_INSPECTOR_API_VERSION_UNSUPPORTED", 400);
  const protocol = url.searchParams.get("protocol") ?? request.headers.get("x-zsys-api-protocol");
  if (protocol !== null && protocol !== INSPECTOR_API_PROTOCOL)
    throw new InspectorEndpointError("ZSYS_INSPECTOR_PROTOCOL_UNSUPPORTED", 400);
}

export function negotiateHeaders(request: Request): void {
  const requested = [request.headers.get("x-zsys-api-version")].filter(
    (value): value is string => value !== null,
  );
  const accepted = request.headers.get("accept")?.match(/(?:^|[;,\s])version=(\d+)/)?.[1];
  if (accepted !== undefined) requested.push(accepted);
  if (requested.some((value) => !/^\d+$/.test(value) || Number(value) !== API_VERSION))
    throw new InspectorEndpointError("ZSYS_INSPECTOR_API_VERSION_UNSUPPORTED", 400);
  const protocol = request.headers.get("x-zsys-api-protocol");
  if (protocol !== null && protocol !== INSPECTOR_API_PROTOCOL)
    throw new InspectorEndpointError("ZSYS_INSPECTOR_PROTOCOL_UNSUPPORTED", 400);
}

export async function withGeneration<T>(
  generation: ResolvedActiveGeneration | undefined,
  handler: (generation: ResolvedActiveGeneration) => Promise<T>,
): Promise<T> {
  return handler(required(generation));
}

export function required(
  generation: ResolvedActiveGeneration | undefined,
): ResolvedActiveGeneration {
  if (generation === undefined)
    throw new InspectorGraphError("ZSYS_INSPECTOR_GRAPH_UNAVAILABLE", 503);
  return generation;
}

export function requiredParam(
  context: { req: { param(name: string): string | undefined } },
  name: string,
): string {
  const value = context.req.param(name);
  if (value === undefined || value.length === 0)
    throw new InspectorEndpointError("ZSYS_INSPECTOR_NOT_FOUND", 404);
  return value;
}

export function installObservability(
  app: Hono,
  options: InspectorApiOptions,
  mode: InspectorMode,
): void {
  const configured =
    options.observability ??
    (options.query && options.stream
      ? { query: options.query, stream: options.stream }
      : undefined);
  if (configured === undefined) return;
  installObservabilityEndpoints(app, {
    query: configured.query,
    stream: configured.stream,
    mode,
    enabled: true,
    ...(options.bearerToken === undefined ? {} : { bearerToken: options.bearerToken }),
    ...(options.authorize === undefined ? {} : { authorize: options.authorize }),
  });
}

export function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  const payload =
    value === null || typeof value !== "object" || Array.isArray(value)
      ? { protocol: INSPECTOR_API_PROTOCOL, version: API_VERSION, data: value }
      : { protocol: INSPECTOR_API_PROTOCOL, version: API_VERSION, ...value };
  return new Response(canonicalJson(payload), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
      "x-zsys-api-version": String(API_VERSION),
      ...headers,
    },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof InspectorEndpointError) return json({ error: error.code }, error.status);
  if (error instanceof InspectorGraphError || error instanceof InspectorRuntimeError)
    return json({ error: error.code }, error.status);
  if (error instanceof InspectorQueryError)
    return json({ error: "ZSYS_INSPECTOR_QUERY_INVALID" }, 400);
  return json({ error: "ZSYS_INSPECTOR_INTERNAL" }, 500);
}
