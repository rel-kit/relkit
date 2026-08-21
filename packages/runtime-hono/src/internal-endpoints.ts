import * as contracts from "@zsys/contracts";
import type { RegistrationPlan } from "@zsys/graph";
import type { Context, Hono } from "hono";
import {
  isAuthorized,
  isInvalidQueryError,
  jsonResponse,
  listResponse,
  readQuery,
  resolveQuery,
  resolveValue,
  streamBody,
} from "./internal-endpoints-utils.js";

export const INTERNAL_ENDPOINT_PROTOCOL = "zsys.inspector" as const;
export const INTERNAL_ENDPOINT_VERSION = contracts.API_VERSION;
export const INTERNAL_ENDPOINT_PATHS = Object.freeze([
  `${contracts.API_BASE_PATH}/health/live`,
  `${contracts.API_BASE_PATH}/health/ready`,
  `${contracts.API_BASE_PATH}/graph`,
  `${contracts.API_BASE_PATH}/requests`,
  `${contracts.API_BASE_PATH}/logs`,
  `${contracts.API_BASE_PATH}/traces`,
  `${contracts.API_BASE_PATH}/stream`,
  `${contracts.API_BASE_PATH}/diagnostics`,
] as const);

export type InternalEndpointMode = "development" | "test" | "production";
export interface InternalQuery {
  readonly cursor?: string;
  readonly limit: number;
  readonly from?: string;
  readonly to?: string;
  readonly severity?: string;
  readonly routeId?: string;
  readonly functionId?: string;
  readonly outcome?: string;
  readonly requestId?: string;
  readonly traceId?: string;
}
export interface InternalPage {
  readonly [key: string]: contracts.JsonValue;
  readonly items: readonly contracts.JsonValue[];
  readonly nextCursor?: string;
}
export interface InternalReadiness {
  readonly ready: boolean;
  readonly reason?: string;
}
export interface InternalStreamEvent {
  readonly [key: string]: contracts.JsonValue;
  readonly cursor: string;
  readonly type: string;
  readonly data: contracts.JsonValue;
}
export type QuerySource =
  | contracts.JsonValue
  | InternalPage
  | ((query: InternalQuery) => contracts.MaybePromise<contracts.JsonValue | InternalPage>);
export type ValueSource<T> = T | (() => contracts.MaybePromise<T>);
export interface InternalEndpointOptions {
  readonly mode?: InternalEndpointMode;
  readonly environment?: InternalEndpointMode;
  readonly enabled?: boolean;
  readonly bearerToken?: string;
  readonly authorize?: (request: Request) => contracts.MaybePromise<boolean>;
  readonly graph?: ValueSource<contracts.JsonValue>;
  readonly readiness?: ValueSource<InternalReadiness>;
  readonly ready?: ValueSource<InternalReadiness>;
  readonly requests?: QuerySource;
  readonly logs?: QuerySource;
  readonly traces?: QuerySource;
  readonly diagnostics?: QuerySource;
  readonly stream?:
    | ValueSource<readonly InternalStreamEvent[]>
    | ((query: InternalQuery) => contracts.MaybePromise<readonly InternalStreamEvent[]>);
}

export class InternalEndpointConfigurationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "InternalEndpointConfigurationError";
  }
}

/** Installs the versioned inspector stubs used before the full API package exists. */
export function installInternalEndpoints(app: Hono, options: InternalEndpointOptions = {}): void {
  const mode = options.environment ?? options.mode ?? "development";
  const enabled = options.enabled ?? mode !== "production";
  validateConfiguration(mode, enabled, options);
  if (!enabled) return;

  const handle =
    (handler: (context: Context) => Promise<Response>) =>
    async (context: Context): Promise<Response> => {
      if (!(await isAuthorized(context.req.raw, options)))
        return jsonResponse({ error: "internal-endpoint-protected" }, 401, {
          "www-authenticate": "Bearer",
        });
      try {
        return await handler(context);
      } catch (error) {
        if (isInvalidQueryError(error)) return jsonResponse({ error: "invalid-query" }, 400);
        return jsonResponse({ error: "internal-error" }, 500);
      }
    };

  app.get(
    `${contracts.API_BASE_PATH}/health/live`,
    handle(async () => jsonResponse({ status: "ok" })),
  );
  app.get(
    `${contracts.API_BASE_PATH}/health/ready`,
    handle(async () => {
      const readiness = await resolveValue(options.readiness ?? options.ready ?? { ready: true });
      return jsonResponse(
        readiness.ready
          ? { status: "ready" }
          : { status: "not-ready", reason: readiness.reason ?? "unavailable" },
        readiness.ready ? 200 : 503,
      );
    }),
  );
  app.get(
    `${contracts.API_BASE_PATH}/graph`,
    handle(async () => jsonResponse(await resolveValue(options.graph ?? { graph: null }))),
  );
  for (const [name, source] of [
    ["requests", options.requests],
    ["logs", options.logs],
    ["traces", options.traces],
    ["diagnostics", options.diagnostics],
  ] as const) {
    if (source === undefined && name !== "diagnostics") continue;
    app.get(
      `${contracts.API_BASE_PATH}/${name}`,
      handle(async (context) => listResponse(source, context)),
    );
  }
  if (options.stream !== undefined)
    app.get(
      `${contracts.API_BASE_PATH}/stream`,
      handle(async (context) => streamResponse(options.stream, context)),
    );
}
export function graphSnapshot(plan: RegistrationPlan): contracts.JsonValue {
  return {
    protocol: INTERNAL_ENDPOINT_PROTOCOL,
    version: INTERNAL_ENDPOINT_VERSION,
    graphHash: plan.graphHash,
    manifestGraphHash: plan.graphHash,
    graphContractVersion: contracts.GRAPH_VERSION,
    manifestContractVersion: contracts.MANIFEST_VERSION,
    manifestGeneratorVersion: contracts.GENERATOR_VERSION,
    functions: plan.functions,
    httpTriggers: plan.httpTriggers,
    queues: plan.queues,
    schedules: plan.schedules,
    eventTriggers: plan.eventTriggers,
    buckets: plan.buckets,
    caches: plan.caches,
    tools: plan.tools,
    agents: plan.agents,
    services: plan.services ?? [],
  } as unknown as contracts.JsonValue;
}

function validateConfiguration(
  mode: InternalEndpointMode,
  enabled: boolean,
  options: InternalEndpointOptions,
): void {
  if (!("development" === mode || "test" === mode || "production" === mode))
    throw new InternalEndpointConfigurationError("mode must be development, test, or production.");
  if (
    mode === "production" &&
    enabled &&
    options.bearerToken === undefined &&
    options.authorize === undefined
  )
    throw new InternalEndpointConfigurationError(
      "Production internal endpoints require bearerToken or authorize protection.",
    );
  if (options.bearerToken !== undefined && options.bearerToken.trim().length === 0)
    throw new InternalEndpointConfigurationError("bearerToken must not be empty.");
}
async function streamResponse(
  source: InternalEndpointOptions["stream"],
  context: Context,
): Promise<Response> {
  const events = source === undefined ? [] : await resolveQuery(source, readQuery(context.req.raw));
  return new Response(streamBody(events), {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/event-stream; charset=utf-8",
      connection: "keep-alive",
      "x-zsys-api-version": String(INTERNAL_ENDPOINT_VERSION),
    },
  });
}
