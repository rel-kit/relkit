import type { BucketOperationObservation } from "@relkit/buckets";
import type { CacheOperationObservation } from "@relkit/cache";
import type { MaybePromise, SpanContext } from "@relkit/contracts";
import type { GraphEdge, ObservedEdge } from "@relkit/graph";
import type {
  InvocationFailure,
  InvocationRunner,
  InvocationValidationError,
  InvocationValueHooks,
  PublicFailureEnvelope,
  InvocationContext as SharedInvocationContext,
  InvocationErrorDefinition as SharedInvocationErrorDefinition,
  InvocationIdSource as SharedInvocationIdSource,
  InvocationMetadata as SharedInvocationMetadata,
  InvocationParent as SharedInvocationParent,
  InvocationRecord as SharedInvocationRecord,
  InvocationSource as SharedInvocationSource,
  InvocationTarget as SharedInvocationTarget,
  PublicClock as SharedPublicClock,
  PublicLogger as SharedPublicLogger,
  TaskAncestry,
} from "@relkit/invocation";
import type { StandardSchemaV1 } from "@relkit/schema";
import type {
  DependencyClientSources,
  DependencyDeclarations,
  DirectTaskInvoker,
} from "./dependencies.js";
import type { FunctionRegistry } from "./registry.js";

/** Successful or failed bucket/cache operation reported to invocation observers. */
export type OperationObservation = BucketOperationObservation | CacheOperationObservation;

/** Shared kernel classification of the caller that initiated execution. */
export type InvocationSource = SharedInvocationSource;

/** Terminal engine outcome; native task suspension is intentionally excluded. */
export type InvocationOutcome =
  | "success"
  | "validation-error"
  | "declared-error"
  | "provider-failure"
  | "cancelled"
  | "timeout"
  | "defect";

/** Shared identity allocator used consistently by parent and child execution. */
export type InvocationIdSource = SharedInvocationIdSource;

/** Declared application error and its validation schema. */
export type InvocationErrorDefinition = SharedInvocationErrorDefinition;

/** Public invocation context owned by the shared execution kernel. */
export type InvocationContext = SharedInvocationContext;

/** Executable target plus declared dependencies used to build guarded clients. */
export interface InvocationTarget<
  Input = unknown,
  Output = unknown,
  Context extends { readonly signal: AbortSignal } = InvocationContext,
> extends SharedInvocationTarget<Input, Output, Context> {
  readonly dependencies?: DependencyDeclarations;
  readonly publications?: Readonly<Record<string, import("./dependencies.js").DependencyRefLike>>;
}

/** Shared execution identity, ancestry, attempt and deadline metadata. */
export type InvocationMetadata = SharedInvocationMetadata;

/** Immutable shared invocation lifecycle record. */
export type InvocationRecord = SharedInvocationRecord;

/** Public observability span snapshot, including correlation and capture metadata. */
export type SpanRecord = import("@relkit/observability").SpanRecord;

/** Shared handler logger; engine adapters preserve its runtime configuration. */
export type PublicLogger = SharedPublicLogger;

/** Shared clock exposed to handlers without exposing the Effect runtime. */
export type PublicClock = SharedPublicClock;

/** Parent identity and cancellation authority for a direct child invocation. */
export type InvocationParent = SharedInvocationParent;

/** Function and trigger capacity requested after input validation succeeds. */
export interface InvocationAdmissionRequest {
  readonly functionId: string;
  readonly source: InvocationSource;
  readonly triggerLimit?: number;
  readonly limit?: number;
  readonly deadlineMs?: number;
  readonly signal: AbortSignal;
}

/** Admitted capacity whose release is safe to call more than once. */
export interface InvocationLease {
  readonly release: () => MaybePromise<void>;
}

/** Native admission seam; absence of a lease still permits execution. */
export type InvocationAdmit = (
  request: InvocationAdmissionRequest,
) => MaybePromise<InvocationLease | void>;

/** Shared inputs supplied to the caller's context factory. */
export type InvocationContextOptions = import("@relkit/invocation").InvocationContextOptions;

/** Advisory lifecycle/telemetry hooks and the optional handler context factory. */
export interface InvocationHooks<
  Context extends { readonly signal: AbortSignal } = InvocationContext,
> {
  readonly observability?: import("./observability.js").InvocationObservabilityHooks;
  readonly onInvocationStart?: (record: InvocationRecord) => MaybePromise<void>;
  readonly onSpanStart?: (record: SpanRecord) => void;
  readonly onSpanComplete?: (record: SpanRecord) => void;
  readonly onDeclaredEdge?: (edge: GraphEdge) => void;
  readonly onObservedEdge?: (edge: ObservedEdge) => void;
  readonly onOperation?: (operation: OperationObservation) => void;
  readonly onCompletion?: (event: InvocationCompletion) => MaybePromise<void>;
  readonly onRelease?: (event: InvocationRelease) => MaybePromise<void>;
  readonly context?: (options: InvocationContextOptions) => MaybePromise<Context>;
}

/** Terminal result reported before the engine releases admission. */
export interface InvocationCompletion {
  readonly record: InvocationRecord;
  readonly outcome: InvocationOutcome;
  readonly error?: InvocationValidationError | InvocationFailure;
  readonly publicError?: PublicFailureEnvelope;
}

/** Release notification including whether execution reached admission. */
export interface InvocationRelease {
  readonly record: InvocationRecord;
  readonly admitted: boolean;
}

/** Execution target, request metadata, generation dependencies and lifecycle adapters. */
export interface InvokeOptions<
  Input = unknown,
  Output = unknown,
  Context extends { readonly signal: AbortSignal } = InvocationContext,
> {
  readonly target?: InvocationTarget<Input, Output, Context>;
  readonly registry?: FunctionRegistry;
  readonly functionId?: string;
  readonly inputSchema?: StandardSchemaV1;
  readonly outputSchema?: StandardSchemaV1;
  readonly errors?: readonly InvocationErrorDefinition[];
  readonly input: unknown;
  readonly source?: InvocationSource;
  readonly triggerLimit?: number;
  readonly attempt?: number;
  readonly parent?: InvocationParent;
  readonly taskAncestry?: TaskAncestry;
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly links?: readonly SpanContext[];
  readonly requestId?: string;
  readonly originRequestId?: string;
  readonly deadlineMs?: number;
  readonly deadline?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly toolHooks?: InvocationValueHooks<Context>;
  readonly env?: Readonly<Record<string, unknown>>;
  readonly clients?: DependencyClientSources;
  readonly invokeTask?: DirectTaskInvoker;
  readonly serviceId?: string;
  readonly now?: () => number;
  readonly admit?: InvocationAdmit;
  readonly admission?: { readonly acquire: InvocationAdmit };
  readonly hooks?: InvocationHooks<Context>;
  readonly effectRunner?: InvocationRunner;
  readonly bridge?: InvocationRunner;
  readonly idSource?: InvocationIdSource;
  readonly progressSink?: import("@relkit/invocation").ProgressSink;
  readonly trigger?: unknown;
  readonly isSuspension?: (cause: unknown) => boolean;
  readonly skipInputValidation?: boolean;
  readonly skipOutputValidation?: boolean;
  readonly taskLifecycle?: TaskLifecycleHooks<Context>;
  readonly taskMetadata?: {
    readonly runId?: string;
    readonly jobId?: string;
    readonly taskId?: string;
    readonly taskVersion?: string;
    readonly buildId?: string;
    readonly serviceGeneration?: string;
  };
}

/** Bounded native task hooks; suspension bypasses success and failure hooks. */
export interface TaskLifecycleHooks<Context extends { readonly signal: AbortSignal }> {
  readonly taskId?: string;
  readonly onStart?: (input: unknown, context: Context) => MaybePromise<void>;
  readonly onSuccess?: (output: unknown, context: Context) => MaybePromise<void>;
  readonly onFailure?: (error: unknown, context: Context) => MaybePromise<void>;
}
