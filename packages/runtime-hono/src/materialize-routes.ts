import type { Hono } from "hono";
import { GENERATOR_VERSION, MANIFEST_VERSION, type MaybePromise } from "@relkit/contracts";
import type { HttpTriggerRegistration, RegistrationPlan } from "@relkit/graph";
import type { RequestRecordSink } from "@relkit/observability";
import type { MiddlewareContext } from "@relkit/routes";
import type { MappingValue, RequestMappingOptions } from "./request-mapping.js";
import { createRouteHandler, getEntry, isRecord } from "./materialize-routes-utils.js";
import { registerRouteMiddleware } from "./route-middleware.js";
import {
  FRAMEWORK_MIDDLEWARE_ORDER,
  type FrameworkMiddleware,
  type FrameworkMiddlewareName,
} from "./middleware.js";
import { withRateLimit, type RateLimitRuntimeOptions } from "./rate-limit.js";
import { registerAuthMiddleware, type HttpAuthInvocation, type HttpAuthRuntime } from "./auth.js";
import { installRpc } from "./rpc.js";
import { installMcp, type McpOptions } from "./mcp.js";
import { installStaticFiles, type StaticFilesOptions } from "./static-files.js";
export type ManifestEntries<T> = Readonly<Record<string, T>> | ReadonlyMap<string, T>;
export interface RuntimeManifest {
  readonly contractVersion: typeof MANIFEST_VERSION;
  readonly generatorVersion: typeof GENERATOR_VERSION;
  readonly graphHash: string;
  readonly functions: ManifestEntries<unknown>;
  readonly targets?: ManifestEntries<unknown>;
  readonly routes?: ManifestEntries<unknown>;
  readonly tools?: ManifestEntries<unknown>;
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
  readonly source: "http" | "tool";
  readonly signal?: AbortSignal;
  readonly requestId?: string;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly timeoutMs?: number;
  readonly auth?: HttpAuthInvocation;
  readonly toolHooks?: {
    readonly onBefore?: (value: unknown, context: unknown) => unknown;
    readonly onAfter?: (value: unknown, context: unknown) => unknown;
  };
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
  readonly auth?: HttpAuthRuntime;
  readonly mcp?: McpOptions;
  readonly staticFiles?: StaticFilesOptions;
  readonly middlewareContext?: (options: {
    readonly middlewareId: string;
    readonly signal: AbortSignal;
    readonly requestId?: string;
    readonly traceId?: string;
  }) => MaybePromise<MiddlewareContext>;
}
export type RuntimeHonoManifestErrorCode =
  | "RELKIT_MANIFEST_VERSION_UNSUPPORTED"
  | "RELKIT_MANIFEST_GENERATOR_UNSUPPORTED"
  | "RELKIT_GRAPH_MANIFEST_MISMATCH"
  | "RELKIT_MANIFEST_MIDDLEWARE_MISSING"
  | "RELKIT_MANIFEST_MIDDLEWARE_MISMATCH"
  | "RELKIT_MANIFEST_RAW_ROUTE_MISSING"
  | "RELKIT_MANIFEST_TRANSFORM_MISSING";
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
      "RELKIT_MANIFEST_VERSION_UNSUPPORTED",
      `Unsupported runtime manifest contract version ${String(manifest.contractVersion)}.`,
    );
  if (manifest.generatorVersion !== GENERATOR_VERSION)
    throw new RuntimeHonoManifestError(
      "RELKIT_MANIFEST_GENERATOR_UNSUPPORTED",
      `Unsupported runtime manifest generator version ${String(manifest.generatorVersion)}.`,
    );
  if (manifest.graphHash !== plan.graphHash)
    throw new RuntimeHonoManifestError(
      "RELKIT_GRAPH_MANIFEST_MISMATCH",
      `Manifest hash ${JSON.stringify(manifest.graphHash)} does not match plan hash ${JSON.stringify(plan.graphHash)}.`,
    );
  for (const middleware of plan.middlewares) {
    const entry = getEntry(manifest.middleware, middleware.id);
    if (!isRecord(entry) || entry.path !== middleware.path || typeof entry.handler !== "function")
      throw new RuntimeHonoManifestError(
        entry === undefined
          ? "RELKIT_MANIFEST_MIDDLEWARE_MISSING"
          : "RELKIT_MANIFEST_MIDDLEWARE_MISMATCH",
        `Manifest middleware "${middleware.id}" is missing or does not match its graph node.`,
        middleware.id,
      );
  }
  for (const trigger of plan.httpTriggers) {
    if (trigger.config.rawHandler === true) {
      const route = getEntry(manifest.routes ?? {}, trigger.id);
      if (!isRecord(route) || typeof route.handler !== "function") {
        throw new RuntimeHonoManifestError(
          "RELKIT_MANIFEST_RAW_ROUTE_MISSING",
          `Manifest raw route "${trigger.id}" is missing its handler.`,
          trigger.id,
        );
      }
      continue;
    }
    for (const transform of trigger.config.transforms) {
      if (getEntry(manifest.requestTransforms, transform.id) === undefined)
        throw new RuntimeHonoManifestError(
          "RELKIT_MANIFEST_TRANSFORM_MISSING",
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
  registerAuthMiddleware(app, options.auth);
  const triggers = [...options.plan.httpTriggers].sort(
    (left, right) => Number(right.config.method === "HEAD") - Number(left.config.method === "HEAD"),
  );
  for (const trigger of triggers) {
    if (trigger.config.rawHandler === true) {
      registerRawRoute(app, trigger, options);
      continue;
    }
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
  installRpc(app, options);
  installMcp(app, options);
  installStaticFiles(app, options.staticFiles);
}
function registerRawRoute(
  app: Hono,
  trigger: HttpTriggerRegistration,
  options: RouteMaterializationOptions,
): void {
  const route = getEntry(options.manifest.routes ?? {}, trigger.id);
  if (!isRecord(route) || typeof route.handler !== "function") return;
  const handler = route.handler as (request: Request) => Response | Promise<Response>;
  for (const path of trigger.config.runtimePaths ?? [trigger.config.path]) {
    app.all(path, (context) => Promise.resolve(handler(context.req.raw)));
  }
}
export { FRAMEWORK_MIDDLEWARE_ORDER };
export type { FrameworkMiddleware, FrameworkMiddlewareName };
