import type { Hono } from "hono";
import { GENERATOR_VERSION, MANIFEST_VERSION, type MaybePromise } from "@zsys/contracts";
import type { HttpTriggerRegistration, RegistrationPlan } from "@zsys/graph";
import type { RequestRecordSink } from "@zsys/observability";
import type { MiddlewareContext } from "@zsys/routes";
import type { MappingValue, RequestMappingOptions } from "./request-mapping.js";
import { createRouteHandler, getEntry, isRecord } from "./materialize-routes-utils.js";
import { registerRouteMiddleware } from "./route-middleware.js";
import {
  FRAMEWORK_MIDDLEWARE_ORDER,
  type FrameworkMiddleware,
  type FrameworkMiddlewareName,
} from "./middleware.js";
import { withRateLimit, type RateLimitRuntimeOptions } from "./rate-limit.js";

export type ManifestEntries<T> = Readonly<Record<string, T>> | ReadonlyMap<string, T>;

export interface RuntimeManifest {
  readonly contractVersion: typeof MANIFEST_VERSION;
  readonly generatorVersion: typeof GENERATOR_VERSION;
  readonly graphHash: string;
  readonly functions: ManifestEntries<unknown>;
  readonly targets?: ManifestEntries<unknown>;
  readonly services?: ManifestEntries<unknown>;
  readonly hooks?: ManifestEntries<unknown>;
  readonly application?: {
    readonly env: unknown;
    readonly providers: unknown;
  };
  readonly middleware: ManifestEntries<unknown>;
  readonly requestTransforms: ManifestEntries<unknown>;
  readonly responseSchemas?: ManifestEntries<unknown>;
}
export interface HttpInvocationOptions {
  readonly functionId: string;
  readonly input: unknown;
  readonly source: "http";
  readonly signal?: AbortSignal;
  readonly requestId?: string;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly timeoutMs?: number;
}
export interface HttpEngine {
  readonly invoke: (options: HttpInvocationOptions) => Promise<unknown>;
}
export interface HttpRouteRequest {
  readonly request: Request;
  readonly pathPattern?: string;
  readonly params: Readonly<Record<string, MappingValue>>;
  readonly query: Readonly<Record<string, MappingValue>>;
  readonly headers: Readonly<Record<string, MappingValue>>;
  readonly validated?: Readonly<Record<string, unknown>>;
}
export type HttpInputMapper = (
  request: HttpRouteRequest,
  trigger: HttpTriggerRegistration,
  targetFunctionId: string,
  mapping?: unknown,
) => unknown | Promise<unknown>;
export interface RouteMaterializationOptions {
  readonly plan: RegistrationPlan;
  readonly manifest: RuntimeManifest;
  readonly engine: HttpEngine;
  readonly mapInput?: HttpInputMapper;
  readonly requestMapping?: RequestMappingOptions;
  readonly responseMapping?: import("./response-mapping.js").ResponseMappingOptions;
  readonly generationId?: string;
  readonly observability?: RequestRecordSink;
  readonly rateLimitRuntime?: RateLimitRuntimeOptions;
  readonly middlewareContext?: (options: {
    readonly middlewareId: string;
    readonly signal: AbortSignal;
    readonly requestId?: string;
    readonly traceId?: string;
  }) => MaybePromise<MiddlewareContext>;
}
export type RuntimeHonoManifestErrorCode =
  | "ZSYS_MANIFEST_VERSION_UNSUPPORTED"
  | "ZSYS_MANIFEST_GENERATOR_UNSUPPORTED"
  | "ZSYS_GRAPH_MANIFEST_MISMATCH"
  | "ZSYS_MANIFEST_MIDDLEWARE_MISSING"
  | "ZSYS_MANIFEST_MIDDLEWARE_MISMATCH"
  | "ZSYS_MANIFEST_TRANSFORM_MISSING";

export class RuntimeHonoManifestError extends Error {
  readonly code: RuntimeHonoManifestErrorCode;
  readonly referenceId?: string;

  constructor(code: RuntimeHonoManifestErrorCode, message: string, referenceId?: string) {
    super(message);
    this.name = "RuntimeHonoManifestError";
    this.code = code;
    if (referenceId !== undefined) this.referenceId = referenceId;
  }
}
/** Verifies the immutable plan/manifest boundary before any route is added. */
export function assertHttpManifest(options: RouteMaterializationOptions): void {
  const { manifest, plan } = options;
  if (manifest.contractVersion !== MANIFEST_VERSION)
    throw new RuntimeHonoManifestError(
      "ZSYS_MANIFEST_VERSION_UNSUPPORTED",
      `Unsupported runtime manifest contract version ${String(manifest.contractVersion)}.`,
    );
  if (manifest.generatorVersion !== GENERATOR_VERSION)
    throw new RuntimeHonoManifestError(
      "ZSYS_MANIFEST_GENERATOR_UNSUPPORTED",
      `Unsupported runtime manifest generator version ${String(manifest.generatorVersion)}.`,
    );
  if (manifest.graphHash !== plan.graphHash)
    throw new RuntimeHonoManifestError(
      "ZSYS_GRAPH_MANIFEST_MISMATCH",
      `Manifest hash ${JSON.stringify(manifest.graphHash)} does not match plan hash ${JSON.stringify(plan.graphHash)}.`,
    );

  for (const middleware of plan.middlewares) {
    const entry = getEntry(manifest.middleware, middleware.id);
    if (!isRecord(entry) || entry.path !== middleware.path || typeof entry.handler !== "function")
      throw new RuntimeHonoManifestError(
        entry === undefined
          ? "ZSYS_MANIFEST_MIDDLEWARE_MISSING"
          : "ZSYS_MANIFEST_MIDDLEWARE_MISMATCH",
        `Manifest middleware "${middleware.id}" is missing or does not match its graph node.`,
        middleware.id,
      );
  }
  for (const trigger of plan.httpTriggers) {
    for (const transform of trigger.config.transforms) {
      if (getEntry(manifest.requestTransforms, transform.id) === undefined)
        throw new RuntimeHonoManifestError(
          "ZSYS_MANIFEST_TRANSFORM_MISSING",
          `Manifest request transform "${transform.id}" is missing.`,
          transform.id,
        );
    }
  }
}
/** Registers only the HTTP triggers already present in the immutable plan. */
export function materializeRoutes(app: Hono, options: RouteMaterializationOptions): void {
  assertHttpManifest(options);
  registerRouteMiddleware(app, options);
  const triggers = [...options.plan.httpTriggers].sort(
    (left, right) => Number(right.config.method === "HEAD") - Number(left.config.method === "HEAD"),
  );
  for (const trigger of triggers) {
    const handler = withRateLimit(trigger, options, createRouteHandler(trigger, options));
    for (const path of trigger.config.runtimePaths ?? [trigger.config.path]) {
      if (trigger.config.method === "HEAD") {
        app.on("GET", path, (context, next) =>
          context.req.method === "HEAD" ? handler(context) : next(),
        );
      } else {
        app.on(trigger.config.method, path, handler);
      }
    }
  }
}

export { FRAMEWORK_MIDDLEWARE_ORDER };
export type { FrameworkMiddleware, FrameworkMiddlewareName };
