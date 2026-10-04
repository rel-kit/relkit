import type {
  ObservabilityEndpointMode,
  ObservabilityEndpointOptions,
} from "./observability.types.js";
export type {
  ObservabilityEndpointMode,
  ObservabilityEndpointOptions,
} from "./observability.types.js";
import { API_BASE_PATH, API_VERSION, canonicalJson, type JsonValue } from "@relkit/contracts";
import { ObservabilityQueryError, ObservabilityStreamError } from "@relkit/observability";
import { Hono, type Context } from "hono";
import { Effect, Layer, ManagedRuntime } from "effect";
import {
  runInspectorPromise as runExecutionPromise,
  unwrapInspectorFailure,
} from "./native-edge.js";
import { InspectorObservability, inspectorObservabilityLayer } from "./observability.service.js";
import { inspectorLoggerLayer, registerInspectorOwner } from "./execution.js";
import { readObservabilityQuery } from "./observability-utils.js";
import { InspectorEndpointError, negotiateHeaders } from "./router-utils.js";
import { EndpointError, ObservabilityEndpointConfigurationError } from "./observability-errors.js";
export { ObservabilityEndpointConfigurationError } from "./observability-errors.js";

export { readObservabilityQuery } from "./observability-utils.js";
export const INSPECTOR_API_PROTOCOL = "relkit.inspector" as const;
export const INSPECTOR_API_VERSION = API_VERSION;

/** Established observation query and SSE route paths. */
export const OBSERVABILITY_ENDPOINT_PATHS = Object.freeze([
  `${API_BASE_PATH}/requests`,
  `${API_BASE_PATH}/requests/:requestId`,
  `${API_BASE_PATH}/logs`,
  `${API_BASE_PATH}/logs/:cursor`,
  `${API_BASE_PATH}/traces`,
  `${API_BASE_PATH}/traces/:traceId`,
  `${API_BASE_PATH}/stream`,
] as const);

/**
 * Builds native observation ingress edges around one reused service owner.
 * @param options - Configured native authorities and ownership policy.
 * @returns A native request handler with existing protocol and authorization behavior.
 */
export function createObservabilityHandler(options: ObservabilityEndpointOptions) {
  const app = new Hono();
  installObservabilityEndpoints(app, options);
  return async (request: Request): Promise<Response> => app.fetch(request);
}

/**
 * Installs bounded observation routes backed by one reused service owner.
 * @param app - Hono router receiving synchronous query and stream registrations.
 * @param options - Native observation authorities, protection and logging settings.
 * @param suppliedOwner - Optional shared router runtime; otherwise this installation acquires its own owner.
 * @returns No value; the router owner retires through disposeInspectorEndpoints.
 * @remarks Each SSE response separately owns its live feed, pull and heartbeat scope.
 */
export function installObservabilityEndpoints(
  app: Hono,
  options: ObservabilityEndpointOptions,
  suppliedOwner?: ManagedRuntime.ManagedRuntime<InspectorObservability, never>,
): void {
  const mode = options.environment ?? options.mode ?? "development";
  const enabled = options.enabled ?? mode !== "production";
  validateConfiguration(mode, enabled, options);
  if (!enabled) return;
  const owner =
    suppliedOwner ??
    ManagedRuntime.make(
      Layer.mergeAll(
        inspectorObservabilityLayer(options.query, options.stream),
        inspectorLoggerLayer(options.logging),
      ),
    );
  registerInspectorOwner(app, owner);

  const guard =
    (handler: (context: Context) => Promise<Response>) =>
    async (context: Context): Promise<Response> => {
      if (!(await authorized(context.req.raw, options)))
        return errorResponse("RELKIT_OBSERVABILITY_UNAUTHORIZED", 401, {
          "www-authenticate": "Bearer",
        });
      try {
        negotiateHeaders(context.req.raw);
        return await handler(context);
      } catch (error) {
        return safeErrorResponse(error);
      }
    };

  for (const kind of ["requests", "logs", "traces"] as const) {
    app.get(
      `${API_BASE_PATH}/${kind}`,
      guard(async (context) =>
        jsonResponse(
          await runExecutionPromise(
            owner,
            Effect.flatMap(InspectorObservability, (service) =>
              service.list(kind, readObservabilityQuery(context.req.raw)),
            ),
          ),
        ),
      ),
    );
  }
  for (const [path, parameter, method] of [
    ["requests", "requestId", "request"],
    ["logs", "cursor", "log"],
    ["traces", "traceId", "trace"],
  ] as const) {
    app.get(
      `${API_BASE_PATH}/${path}/:${parameter}`,
      guard(async (context) => {
        const id = context.req.param(parameter);
        if (id === undefined) throw new EndpointError("RELKIT_OBSERVABILITY_NOT_FOUND", 404);
        const detail = await runExecutionPromise(
          owner,
          Effect.flatMap(InspectorObservability, (service) => service.detail(method, id)),
        );
        if (detail === undefined) throw new EndpointError("RELKIT_OBSERVABILITY_NOT_FOUND", 404);
        return jsonResponse(detail);
      }),
    );
  }
  app.get(
    `${API_BASE_PATH}/stream`,
    guard(async (context) =>
      runExecutionPromise(
        owner,
        Effect.flatMap(InspectorObservability, (service) =>
          service.response(context.req.raw, INSPECTOR_API_VERSION),
        ),
      ),
    ),
  );
}

/**
 * Rejects unsupported modes and invalid protection or paired-authority settings before installation.
 * @param mode - Configured Inspector environment used for authorization and audit identity.
 * @param enabled - Whether this installation exposes Inspector routes.
 * @param options - Configured native authorities and ownership policy.
 * @returns No value after validating the existing configuration contract.
 */
function validateConfiguration(
  mode: ObservabilityEndpointMode,
  enabled: boolean,
  options: ObservabilityEndpointOptions,
): void {
  if (!(mode === "development" || mode === "test" || mode === "production"))
    throw new ObservabilityEndpointConfigurationError("mode is invalid");
  if (
    mode === "production" &&
    enabled &&
    options.bearerToken === undefined &&
    options.authorize === undefined
  )
    throw new ObservabilityEndpointConfigurationError(
      "Production observability endpoints require bearerToken or authorize protection.",
    );
  if (options.bearerToken !== undefined && options.bearerToken.trim().length === 0)
    throw new ObservabilityEndpointConfigurationError("bearerToken must not be empty");
}

/**
 * Checks configured native authorization and existing bearer protection before data access.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @param options - Configured native authorities and ownership policy.
 * @returns Whether the native request is authorized.
 */
async function authorized(
  request: Request,
  options: ObservabilityEndpointOptions,
): Promise<boolean> {
  if (options.authorize !== undefined) {
    try {
      if (await options.authorize(request)) return true;
    } catch {
      return false;
    }
    if (options.bearerToken === undefined) return false;
  }
  return options.bearerToken === undefined
    ? true
    : request.headers.get("authorization") === `Bearer ${options.bearerToken}`;
}

/**
 * Serializes the existing versioned observation response with no-store headers.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @param status - Public HTTP status associated with the response.
 * @param headers - Optional native response headers merged into the no-store JSON envelope.
 * @returns A native JSON response.
 */
function jsonResponse(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(canonicalJson(value as JsonValue), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-relkit-api-version": String(INSPECTOR_API_VERSION),
      ...headers,
    },
  });
}

/**
 * Projects failures into the existing bounded public HTTP error envelope.
 * @param code - Existing public failure code.
 * @param status - Public HTTP status associated with the response.
 * @param headers - Optional native response headers merged into the public error envelope.
 * @returns A native response retaining the existing public status contract.
 */
function errorResponse(
  code: string,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return jsonResponse(
    { protocol: INSPECTOR_API_PROTOCOL, version: INSPECTOR_API_VERSION, error: code },
    status,
    headers,
  );
}

/**
 * Maps recognized native observation failures without exposing their private causes.
 * @param error - Native or validation failure to preserve in the public compatibility envelope.
 * @returns A bounded public error response.
 */
function safeErrorResponse(error: unknown): Response {
  error = unwrapInspectorFailure(error);
  if (error instanceof EndpointError) return errorResponse(error.code, error.status);
  if (error instanceof InspectorEndpointError) return errorResponse(error.code, error.status);
  if (error instanceof ObservabilityQueryError) return errorResponse(error.code, 400);
  if (error instanceof ObservabilityStreamError) return errorResponse(error.code, 400);
  return errorResponse("RELKIT_OBSERVABILITY_INTERNAL", 500);
}
