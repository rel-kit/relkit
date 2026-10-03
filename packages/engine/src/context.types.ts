import type {
  DependencyBridge,
  DependencyClientSources,
  DependencyDeclarations,
  DirectFunctionInvoker,
  DirectTaskInvoker,
} from "./dependencies.js";

/** Base shared handler context with optional native client sources. */
export interface InvocationContextBase {
  readonly invocation: unknown;
  readonly signal: AbortSignal;
  readonly env: Readonly<Record<string, unknown>>;
  readonly log: unknown;
  readonly time: unknown;
}

/** Declarations and dispatch bridges used to replace client maps safely. */
export interface ContextBuildOptions {
  readonly ownerId: string;
  readonly dependencies?: DependencyDeclarations;
  readonly publications?: Readonly<Record<string, import("./dependencies.js").DependencyRefLike>>;
  readonly clients?: DependencyClientSources;
  readonly bridge?: DependencyBridge;
  readonly signal?: () => AbortSignal;
  readonly deadline?: () => number | undefined;
  readonly correlationId?: () => string | undefined;
  readonly causationInvocationId?: () => string | undefined;
  readonly traceId?: () => string | undefined;
  readonly now?: () => Date;
  readonly invokeFunction?: DirectFunctionInvoker;
  readonly invokeTask?: DirectTaskInvoker;
  readonly onDeclaredEdge?: (edge: import("@relkit/graph").GraphEdge) => void;
  readonly onObservedEdge?: (edge: import("@relkit/graph").ObservedEdge) => void;
  readonly onOperation?: (
    operation:
      | import("@relkit/buckets").BucketOperationObservation
      | import("@relkit/cache").CacheOperationObservation,
  ) => void;
  readonly trigger?: unknown;
  readonly progress?: import("@relkit/invocation").ProgressEmitter;
}
