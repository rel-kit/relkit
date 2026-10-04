import { API_VERSION, canonicalJson } from "@relkit/contracts";
import { Schema } from "effect";
import { unwrapInspectorFailure } from "./native-edge.js";
import type { Hono } from "hono";
import type { ManagedRuntime } from "effect";
import type { InspectorObservability } from "./observability.service.js";
import { installObservabilityEndpoints, INSPECTOR_API_PROTOCOL } from "./observability.js";
import { InspectorGraphError } from "./graph.js";
import { InspectorRuntimeError } from "./runtime.js";
import { InspectorJobsError } from "./jobs/types.js";
import {
  InspectorQueryError,
  type InspectorMode,
  type ResolvedActiveGeneration,
} from "./shared.js";
import type { InspectorApiOptions } from "./router.js";

/** Existing TypeError configuration failure preserving the synchronous installer contract. */
export class InspectorEndpointConfigurationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "InspectorEndpointConfigurationError";
  }
}

/** Public endpoint protocol/parameter failure with a schema-backed internal tag. */
export class InspectorEndpointError extends Schema.TaggedError<InspectorEndpointError>()(
  "InspectorEndpointError",
  { code: Schema.String, status: Schema.Number, message: Schema.String },
) {
  constructor(code: string, status: number) {
    super({ code, status, message: code });
    this.name = "InspectorEndpointError";
  }
}

/**
 * Rejects unsupported modes and invalid protection or paired-authority settings before installation.
 * @param mode - Configured Inspector environment used for authorization and audit identity.
 * @param enabled - Whether this installation exposes Inspector routes.
 * @param options - Configured native authorities and ownership policy.
 * @returns No value after validating the existing configuration contract.
 */
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

/**
 * Checks configured native authorization and existing bearer protection before data access.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @param options - Configured native authorities and ownership policy.
 * @returns Whether the native request is authorized.
 */
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

/**
 * Validates request API version and protocol before accessing generation data.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns No value after accepting the existing protocol contract.
 */
export function negotiate(request: Request): void {
  const url = new URL(request.url);
  negotiateHeaders(request);
  const requested = [url.searchParams.get("version")].filter(
    (value): value is string => value !== null,
  );
  if (requested.some((value) => !/^\d+$/.test(value) || Number(value) !== API_VERSION))
    throw new InspectorEndpointError("RELKIT_INSPECTOR_API_VERSION_UNSUPPORTED", 400);
  const protocol = url.searchParams.get("protocol") ?? request.headers.get("x-relkit-api-protocol");
  if (protocol !== null && protocol !== INSPECTOR_API_PROTOCOL)
    throw new InspectorEndpointError("RELKIT_INSPECTOR_PROTOCOL_UNSUPPORTED", 400);
}

/**
 * Validates native API-version, accept-version and protocol headers.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns No value after accepting compatible headers.
 */
export function negotiateHeaders(request: Request): void {
  const requested = [request.headers.get("x-relkit-api-version")].filter(
    (value): value is string => value !== null,
  );
  const accepted = request.headers.get("accept")?.match(/(?:^|[;,\s])version=(\d+)/)?.[1];
  if (accepted !== undefined) requested.push(accepted);
  if (requested.some((value) => !/^\d+$/.test(value) || Number(value) !== API_VERSION))
    throw new InspectorEndpointError("RELKIT_INSPECTOR_API_VERSION_UNSUPPORTED", 400);
  const protocol = request.headers.get("x-relkit-api-protocol");
  if (protocol !== null && protocol !== INSPECTOR_API_PROTOCOL)
    throw new InspectorEndpointError("RELKIT_INSPECTOR_PROTOCOL_UNSUPPORTED", 400);
}

/**
 * Passes a required active generation to a native continuation.
 * @typeParam T - Successful public or native value retained by this boundary.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param handler - Native continuation receiving a required active generation.
 * @returns The continuation result, preserving the existing graph-unavailable error.
 */
export async function withGeneration<T>(
  generation: ResolvedActiveGeneration | undefined,
  handler: (generation: ResolvedActiveGeneration) => Promise<T>,
): Promise<T> {
  return handler(required(generation));
}

/**
 * Requires an active generation without fabricating graph identity.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @returns The same resolved generation or the existing unavailable error.
 */
export function required(
  generation: ResolvedActiveGeneration | undefined,
): ResolvedActiveGeneration {
  if (generation === undefined)
    throw new InspectorGraphError("RELKIT_INSPECTOR_GRAPH_UNAVAILABLE", 503);
  return generation;
}

/**
 * Requires a nonempty declared route parameter.
 * @param context - Native request context retained only for this ingress operation.
 * @param name - Public field or route parameter name.
 * @returns The existing native parameter value or not-found error.
 */
export function requiredParam(
  context: { req: { param(name: string): string | undefined } },
  name: string,
): string {
  const value = context.req.param(name);
  if (value === undefined || value.length === 0)
    throw new InspectorEndpointError("RELKIT_INSPECTOR_NOT_FOUND", 404);
  return value;
}

/**
 * Installs configured observation edges on the reused Inspector router owner.
 * @param app - Hono router receiving the synchronous route registrations.
 * @param options - Configured native authorities and ownership policy.
 * @param mode - Configured Inspector environment used for authorization and audit identity.
 * @param owner - Reused service runtime supplied by the installing router.
 * @returns No value; absent observation configuration installs no routes.
 */
export function installObservability(
  app: Hono,
  options: InspectorApiOptions,
  mode: InspectorMode,
  owner?: ManagedRuntime.ManagedRuntime<InspectorObservability, never>,
): void {
  const configured =
    options.observability ??
    (options.query && options.stream
      ? { query: options.query, stream: options.stream }
      : undefined);
  if (configured === undefined) return;
  installObservabilityEndpoints(
    app,
    {
      query: configured.query,
      stream: configured.stream,
      mode,
      enabled: true,
      ...(options.bearerToken === undefined ? {} : { bearerToken: options.bearerToken }),
      ...(options.authorize === undefined ? {} : { authorize: options.authorize }),
      ...(options.logging === undefined ? {} : { logging: options.logging }),
    },
    owner,
  );
}

/**
 * Serializes the established Inspector protocol envelope and response headers.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @param status - Public HTTP status associated with the response.
 * @param headers - Optional native response headers merged into the JSON envelope.
 * @returns A native no-store JSON response.
 */
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
      "x-relkit-api-version": String(API_VERSION),
      ...headers,
    },
  });
}

/**
 * Projects failures into the existing bounded public HTTP error envelope.
 * @param error - Native or validation failure to preserve in the public compatibility envelope.
 * @returns A native response retaining the existing public status contract.
 */
export function errorResponse(error: unknown): Response {
  error = unwrapInspectorFailure(error);
  if (error instanceof InspectorEndpointError) return json({ error: error.code }, error.status);
  if (error instanceof InspectorGraphError || error instanceof InspectorRuntimeError)
    return json({ error: error.code }, error.status);
  if (error instanceof InspectorJobsError) return json({ error: error.code }, error.status);
  if (error instanceof InspectorQueryError)
    return json({ error: "RELKIT_INSPECTOR_QUERY_INVALID" }, 400);
  return json({ error: "RELKIT_INSPECTOR_INTERNAL" }, 500);
}
