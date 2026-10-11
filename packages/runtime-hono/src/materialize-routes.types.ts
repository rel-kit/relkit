import type { UpgradeWebSocket } from "hono/ws";
import type { GENERATOR_VERSION, MANIFEST_VERSION, MaybePromise } from "@relkit/contracts";
import type { HttpTriggerRegistration, RegistrationPlan } from "@relkit/graph";
import type { RequestRecordSink } from "@relkit/observability";
import type { MiddlewareContext } from "@relkit/routes";
import type { MappingValue, RequestMappingOptions } from "./request-mapping.js";
import type { RateLimitRuntimeOptions } from "./rate-limit.js";
import type { HttpAuthInvocation, HttpAuthRuntime } from "./auth.js";
import type { McpOptions } from "./mcp.js";
import type { StaticFilesOptions } from "./static-files.js";
import type { ClientIdentityRuntime } from "./client-identity.js";
import type { TransportSecurityOptions } from "./transport-security.js";
import type { RealtimeRuntime } from "./realtime-runtime.js";
import type { AgentRuntime } from "./agent-runtime.js";
import type { JobsRpcRuntime } from "./jobs/types.js";

/** Contract for manifest entries used by materialize routes.
 * @typeParam T - Value type retained by this operation.
 */
export type ManifestEntries<T> = Readonly<Record<string, T>> | ReadonlyMap<string, T>;

/** Contract for runtime manifest used by materialize routes. */
export interface RuntimeManifest {
  readonly contractVersion: typeof MANIFEST_VERSION;
  readonly generatorVersion: typeof GENERATOR_VERSION;
  readonly graphHash: string;
  readonly activationFingerprint: import("@relkit/contracts").RuntimeActivationFingerprint;
  readonly runtimeIntegrationsPlan: import("@relkit/contracts").RuntimeIntegrationPlanReference;
  readonly functions: ManifestEntries<unknown>;
  readonly targetLoaders?: ManifestEntries<() => Promise<unknown>>;
  readonly targets?: ManifestEntries<unknown>;
  readonly agents?: ManifestEntries<unknown>;
  readonly channels?: ManifestEntries<unknown>;
  readonly routes?: ManifestEntries<unknown>;
  readonly tools?: ManifestEntries<unknown>;
  readonly services?: ManifestEntries<unknown>;
  readonly tasks?: ManifestEntries<unknown>;
  readonly jobs?: ManifestEntries<unknown>;
  readonly hooks?: ManifestEntries<unknown>;
  readonly application?: {
    readonly env: unknown;
  };
  readonly middleware: ManifestEntries<unknown>;
  readonly requestTransforms: ManifestEntries<unknown>;
  readonly responseSchemas?: ManifestEntries<unknown>;
}

/** http invocation options configuring dependencies, callbacks and runtime policy. */
export interface HttpInvocationOptions {
  readonly functionId: string;
  readonly input: unknown;
  readonly target?: unknown;
  readonly source: "http" | "tool";
  readonly signal?: AbortSignal;
  readonly requestId?: string;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly timeoutMs?: number;
  readonly auth?: HttpAuthInvocation;
  readonly trigger?: unknown;
  readonly progressSink?: import("@relkit/invocation").ProgressSink;
  readonly toolHooks?: {
    readonly onBefore?: (value: unknown, context: unknown) => unknown;
    readonly onAfter?: (value: unknown, context: unknown) => unknown;
  };
}

/** Contract for http engine used by materialize routes. */
export interface HttpEngine {
  readonly invoke: (options: HttpInvocationOptions) => Promise<unknown>;
}

/** Contract for http route request used by materialize routes. */
export interface HttpRouteRequest {
  readonly request: Request;
  readonly pathPattern?: string;
  readonly params: Readonly<Record<string, MappingValue>>;
  readonly query: Readonly<Record<string, MappingValue>>;
  readonly headers: Readonly<Record<string, MappingValue>>;
  readonly validated?: Readonly<Record<string, unknown>>;
}

/** Contract for http input mapper used by materialize routes. */
export type HttpInputMapper = (
  request: HttpRouteRequest,
  trigger: HttpTriggerRegistration,
  targetFunctionId: string,
  mapping?: unknown,
) => unknown | Promise<unknown>;

/** route materialization options configuring dependencies, callbacks and runtime policy. */
export interface RouteMaterializationOptions {
  /** Optional Effect logger sinks and threshold for this application. */
  readonly effectLogger?: import("@relkit/runtime-effect").LoggerOptions;
  readonly plan: RegistrationPlan;
  readonly manifest: RuntimeManifest;
  readonly engine: HttpEngine;
  readonly resolveTarget?: (functionId: string) => MaybePromise<unknown>;
  readonly mapInput?: HttpInputMapper;
  readonly requestMapping?: RequestMappingOptions;
  readonly responseMapping?: import("./response-mapping.js").ResponseMappingOptions;
  readonly generationId?: string;
  readonly observability?: RequestRecordSink;
  readonly rateLimitRuntime?: RateLimitRuntimeOptions;
  readonly auth?: HttpAuthRuntime;
  readonly clientIdentity?: ClientIdentityRuntime;
  readonly transportSecurity?: TransportSecurityOptions;
  readonly realtime?: RealtimeRuntime;
  readonly agentRuntime?: AgentRuntime;
  readonly jobs?: JobsRpcRuntime;
  /** Compatibility alias for callers that name the service explicitly. */
  readonly jobsRuntime?: JobsRpcRuntime;
  readonly mcp?: McpOptions;
  readonly staticFiles?: StaticFilesOptions;
  readonly upgradeWebSocket?: UpgradeWebSocket;
  readonly middlewareContext?: (options: {
    readonly middlewareId: string;
    readonly signal: AbortSignal;
    readonly request: Request;
    readonly auth?: HttpAuthInvocation;
    readonly requestId?: string;
    readonly traceId?: string;
  }) => MaybePromise<MiddlewareContext>;
}
