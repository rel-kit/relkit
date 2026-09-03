import {
  API_BASE_PATH,
  API_VERSION,
  canonicalJson,
  type JsonValue,
  type MaybePromise,
} from "@relkit/contracts";
import {
  ObservabilityQueryError,
  ObservabilityStreamError,
  type ObservabilityQuery,
  type ObservabilityStream,
} from "@relkit/observability";
import { Hono, type Context } from "hono";
import { readObservabilityQuery, streamResponse } from "./observability-utils.js";
import { InspectorEndpointError, negotiateHeaders } from "./router-utils.js";

export { readObservabilityQuery } from "./observability-utils.js";

export const INSPECTOR_API_PROTOCOL = "relkit.inspector" as const;
export const INSPECTOR_API_VERSION = API_VERSION;
export const OBSERVABILITY_ENDPOINT_PATHS = Object.freeze([
  `${API_BASE_PATH}/requests`,
  `${API_BASE_PATH}/requests/:requestId`,
  `${API_BASE_PATH}/logs`,
  `${API_BASE_PATH}/logs/:cursor`,
  `${API_BASE_PATH}/traces`,
  `${API_BASE_PATH}/traces/:traceId`,
  `${API_BASE_PATH}/stream`,
] as const);

export type ObservabilityEndpointMode = "development" | "test" | "production";

export function createObservabilityHandler(options: ObservabilityEndpointOptions) {
  const app = new Hono();
  installObservabilityEndpoints(app, options);
  return async (request: Request): Promise<Response> => app.fetch(request);
}

export interface ObservabilityEndpointOptions {
  readonly query: ObservabilityQuery;
  readonly stream: ObservabilityStream;
  readonly mode?: ObservabilityEndpointMode;
  readonly environment?: ObservabilityEndpointMode;
  readonly enabled?: boolean;
  readonly bearerToken?: string;
  readonly authorize?: (request: Request) => MaybePromise<boolean>;
}

export class ObservabilityEndpointConfigurationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "ObservabilityEndpointConfigurationError";
  }
}

/** Installs the bounded, versioned observability query and SSE endpoints. */
export function installObservabilityEndpoints(
  app: Hono,
  options: ObservabilityEndpointOptions,
): void {
  const mode = options.environment ?? options.mode ?? "development";
  const enabled = options.enabled ?? mode !== "production";
  validateConfiguration(mode, enabled, options);
  if (!enabled) return;

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
        jsonResponse(await options.query[kind](readObservabilityQuery(context.req.raw))),
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
        const detail = await options.query[method](id);
        if (detail === undefined) throw new EndpointError("RELKIT_OBSERVABILITY_NOT_FOUND", 404);
        return jsonResponse(detail);
      }),
    );
  }
  app.get(
    `${API_BASE_PATH}/stream`,
    guard(async (context) =>
      streamResponse(options.stream, context.req.raw, INSPECTOR_API_VERSION),
    ),
  );
}

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

function safeErrorResponse(error: unknown): Response {
  if (error instanceof EndpointError) return errorResponse(error.code, error.status);
  if (error instanceof InspectorEndpointError) return errorResponse(error.code, error.status);
  if (error instanceof ObservabilityQueryError) return errorResponse(error.code, 400);
  if (error instanceof ObservabilityStreamError) return errorResponse(error.code, 400);
  return errorResponse("RELKIT_OBSERVABILITY_INTERNAL", 500);
}
class EndpointError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}
