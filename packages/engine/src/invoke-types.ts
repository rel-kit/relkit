import type { FunctionRequest, MaybePromise } from "@zsys/contracts";
import type { BucketOperationObservation } from "@zsys/buckets";
import type { CacheOperationObservation } from "@zsys/cache";
import type { GraphEdge, ObservedEdge } from "@zsys/graph";
import {
  InvocationValidationError,
  type InvocationContext as SharedInvocationContext,
  type InvocationErrorDefinition as SharedInvocationErrorDefinition,
  type InvocationIdSource as SharedInvocationIdSource,
  type InvocationMetadata as SharedInvocationMetadata,
  type InvocationParent as SharedInvocationParent,
  type InvocationRecord as SharedInvocationRecord,
  type InvocationSource as SharedInvocationSource,
  type InvocationTarget as SharedInvocationTarget,
  type PublicClock as SharedPublicClock,
  type PublicLogger as SharedPublicLogger,
  type ServicePolicySource,
} from "@zsys/invocation";
import type { InvocationFailure, InvocationRunner, PublicFailureEnvelope } from "@zsys/invocation";
import type { StandardIssue, StandardSchemaV1 } from "@zsys/schema";
import type { FunctionRegistry } from "./registry.js";
import type { DependencyClientSources, DependencyDeclarations } from "./dependencies.js";

type OperationObservation = BucketOperationObservation | CacheOperationObservation;

export type InvocationSource = SharedInvocationSource;
export type InvocationOutcome =
  | "success"
  | "validation-error"
  | "declared-error"
  | "provider-failure"
  | "cancelled"
  | "timeout"
  | "defect";
export type InvocationIdSource = SharedInvocationIdSource;
export type InvocationErrorDefinition = SharedInvocationErrorDefinition;
export type InvocationContext = SharedInvocationContext;
export interface InvocationTarget<
  Input = unknown,
  Output = unknown,
  Context extends { readonly signal: AbortSignal } = InvocationContext,
> extends SharedInvocationTarget<Input, Output, Context> {
  readonly dependencies?: DependencyDeclarations;
}
export type InvocationMetadata = SharedInvocationMetadata;
export type InvocationRecord = SharedInvocationRecord;
export interface SpanRecord {
  readonly invocationId: string;
  readonly functionId: string;
  readonly name: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly traceId: string;
  readonly source: InvocationSource;
  readonly serviceId?: string;
  readonly status: "started" | "completed";
  readonly startedAt: string;
  readonly completedAt?: string;
}
export type PublicLogger = SharedPublicLogger;
export type PublicClock = SharedPublicClock;
export type InvocationParent = SharedInvocationParent;

export interface InvocationAdmissionRequest {
  readonly functionId: string;
  readonly source: InvocationSource;
  readonly triggerLimit?: number;
  readonly limit?: number;
  readonly deadlineMs?: number;
  readonly signal: AbortSignal;
}

export interface InvocationLease {
  readonly release: () => MaybePromise<void>;
}
export type InvocationAdmit = (
  request: InvocationAdmissionRequest,
) => MaybePromise<InvocationLease | void>;

export type InvocationContextOptions = import("@zsys/invocation").InvocationContextOptions;

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
export interface InvocationCompletion {
  readonly record: InvocationRecord;
  readonly outcome: InvocationOutcome;
  readonly error?: InvocationValidationError | InvocationFailure;
  readonly publicError?: PublicFailureEnvelope;
}

export interface InvocationRelease {
  readonly record: InvocationRecord;
  readonly admitted: boolean;
}

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
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly deadlineMs?: number;
  readonly deadline?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly request?: FunctionRequest;
  readonly env?: Readonly<Record<string, unknown>>;
  readonly clients?: DependencyClientSources;
  readonly servicePolicies?: ServicePolicySource;
  readonly now?: () => number;
  readonly admit?: InvocationAdmit;
  readonly admission?: { readonly acquire: InvocationAdmit };
  readonly hooks?: InvocationHooks<Context>;
  readonly effectRunner?: InvocationRunner;
  readonly bridge?: InvocationRunner;
  readonly idSource?: InvocationIdSource;
}

export { InvocationValidationError };
