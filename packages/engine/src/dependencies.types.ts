import type { BucketOperationObservation } from "@relkit/buckets";
import type { CacheOperationObservation } from "@relkit/cache";
import type { MaybePromise } from "@relkit/contracts";
import type { GraphEdge, ObservedEdge } from "@relkit/graph";
import type { StandardSchemaV1 } from "@relkit/schema";
import type { DEPENDENCY_CATEGORIES } from "./dependencies.js";
import type { InvocationErrorDefinition } from "./invoke-types.js";

/** Supported declared client families; events use publications rather than dependencies. */
export type DependencyCategory = (typeof DEPENDENCY_CATEGORIES)[number];

/** Authored or manifest-bound dependency identity and invocation metadata. */
export interface DependencyRefLike {
  readonly ref?: { readonly kind: string; readonly id: string };
  readonly kind?: string;
  readonly id?: string;
  readonly input?: StandardSchemaV1;
  readonly version?: number;
  readonly output?: StandardSchemaV1;
  readonly key?: StandardSchemaV1;
  readonly value?: StandardSchemaV1;
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
  readonly profile?: string;
  readonly errors?: readonly InvocationErrorDefinition[];
  readonly dependencies?: DependencyDeclarations;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
}

/** Declared capabilities allowed in a handler's guarded context. */
export type DependencyDeclarations = Partial<{
  readonly [Category in Exclude<DependencyCategory, "events">]: Readonly<
    Record<string, DependencyRefLike>
  >;
}>;

/** Runtime provider/client values keyed by names declared on a function. */
export type DependencyClientSources = Partial<{
  readonly [Category in DependencyCategory]: Readonly<Record<string, unknown>>;
}>;

/** Frozen category maps denying access to undeclared clients. */
export type DependencyClientMaps = {
  readonly [Category in DependencyCategory]: Readonly<Record<string, unknown>>;
};

/** Cancellation, deadline and operation identity supplied to a native bridge. */
export interface DependencyBridgeOptions {
  readonly name?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
  readonly kind?: "internal" | "server" | "client" | "producer" | "consumer";
  readonly input?: unknown;
}

/** Adapter that evaluates native capability calls inside the active invocation runtime. */
export interface DependencyBridge {
  readonly run: <A>(
    operation: () => MaybePromise<A>,
    options?: DependencyBridgeOptions,
  ) => Promise<A>;
  readonly runVoid: (
    operation: () => MaybePromise<void>,
    options?: DependencyBridgeOptions,
  ) => Promise<void>;
}

/** Declared direct call resolved against the active generation registry. */
export interface DirectFunctionRequest {
  readonly functionId: string;
  readonly name: string;
  readonly declaration: DependencyRefLike;
  readonly source: unknown;
  readonly input: unknown;
  readonly signal?: AbortSignal;
}

/** Declared native task submission carrying cancellation and caller options. */
export interface DirectTaskRequest {
  readonly taskId: string;
  readonly name: string;
  readonly declaration: DependencyRefLike;
  readonly source: unknown;
  readonly input: unknown;
  readonly options?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
}

/** Direct function dispatch seam preserving shared invocation ancestry. */
export type DirectFunctionInvoker = (request: DirectFunctionRequest) => MaybePromise<unknown>;

/** Task submission seam preserving provider-owned durable execution. */
export type DirectTaskInvoker = (request: DirectTaskRequest) => MaybePromise<unknown>;

/** Declared dependency/publication maps and their generation-bound native sources. */
export interface DependencyClientBuildOptions {
  readonly ownerId: string;
  readonly dependencies?: DependencyDeclarations;
  readonly publications?: Readonly<Record<string, DependencyRefLike>>;
  readonly sources?: DependencyClientSources;
  readonly bridge?: DependencyBridge;
  readonly signal?: () => AbortSignal;
  readonly deadline?: () => number | undefined;
  readonly correlationId?: () => string | undefined;
  readonly causationInvocationId?: () => string | undefined;
  readonly traceId?: () => string | undefined;
  readonly now?: () => Date;
  readonly invokeFunction?: DirectFunctionInvoker;
  readonly invokeTask?: DirectTaskInvoker;
  readonly onDeclaredEdge?: (edge: GraphEdge) => void;
  readonly onObservedEdge?: (edge: ObservedEdge) => void;
  readonly onOperation?: (
    operation: BucketOperationObservation | CacheOperationObservation,
  ) => void;
}
