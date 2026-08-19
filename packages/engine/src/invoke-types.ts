import type { MaybePromise, ProtocolId } from "@zsys/contracts";
import type { BucketOperationObservation } from "@zsys/buckets";
import type { CacheOperationObservation } from "@zsys/cache";
import type { GraphEdge, ObservedEdge } from "@zsys/graph";
import type {
  InvocationFailure,
  InvocationRunner,
  PublicClock,
  PublicFailureEnvelope,
} from "@zsys/runtime-effect";
import type { StandardIssue, StandardSchemaV1 } from "@zsys/schema";
import type { FunctionRegistry } from "./registry.js";
import type { DependencyClientSources, DependencyDeclarations } from "./dependencies.js";

type OperationObservation = BucketOperationObservation | CacheOperationObservation;

export type InvocationSource = "direct" | "http" | "job" | "event" | "tool" | "agent";
export type InvocationOutcome =
  | "success"
  | "validation-error"
  | "declared-error"
  | "provider-failure"
  | "cancelled"
  | "timeout"
  | "defect";
type InvocationKind = "trace" | "invocation" | "span";
export type InvocationIdSource = { readonly next: (kind: InvocationKind) => ProtocolId };
export interface InvocationErrorDefinition {
  readonly id: string;
  readonly data: StandardSchemaV1;
}
export interface InvocationContext {
  readonly invocation: InvocationMetadata;
  readonly signal: AbortSignal;
  readonly env: Readonly<Record<string, unknown>>;
  readonly log: PublicLogger;
  readonly time: PublicClock;
  readonly functions: Readonly<Record<string, never>>;
  readonly jobs: Readonly<Record<string, never>>;
  readonly events: Readonly<Record<string, never>>;
  readonly buckets: Readonly<Record<string, never>>;
  readonly cache: Readonly<Record<string, never>>;
  readonly agents: Readonly<Record<string, never>>;
}
export interface InvocationTarget<
  Input = unknown,
  Output = unknown,
  Context extends { readonly signal: AbortSignal } = InvocationContext,
> {
  readonly id: string;
  readonly input: StandardSchemaV1;
  readonly output: StandardSchemaV1;
  readonly errors?: readonly InvocationErrorDefinition[];
  readonly dependencies?: DependencyDeclarations;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly handler: (input: Input, context: Context) => MaybePromise<Output>;
}
export interface InvocationMetadata {
  readonly id: string;
  readonly parentId?: string;
  readonly traceId: string;
  readonly correlationId?: string;
  readonly startedAt: string;
  readonly deadline?: string;
  readonly attempt: number;
  readonly source: InvocationSource;
}
export interface InvocationRecord extends InvocationMetadata {
  readonly functionId: string;
  readonly status: "started" | InvocationOutcome;
  readonly completedAt?: string;
  readonly durationMs?: number;
}
export interface SpanRecord {
  readonly invocationId: string;
  readonly functionId: string;
  readonly name: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly traceId: string;
  readonly source: InvocationSource;
  readonly status: "started" | "completed";
  readonly startedAt: string;
  readonly completedAt?: string;
}
export interface PublicLogger {
  readonly trace: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
  readonly debug: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
  readonly info: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
  readonly warn: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
  readonly error: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
}

export interface InvocationParent {
  readonly id: string;
  readonly traceId: string;
  readonly spanId?: string;
  readonly correlationId?: string;
  readonly deadlineMs?: number;
  readonly signal?: AbortSignal;
  /** Internal captured span state used to keep direct children on the parent trace. */
  readonly trace?: unknown;
}

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

export interface InvocationContextOptions {
  readonly invocation: InvocationRecord;
  readonly signal: AbortSignal;
  readonly env: Readonly<Record<string, unknown>>;
  readonly time: PublicClock;
}

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
  readonly env?: Readonly<Record<string, unknown>>;
  readonly clients?: DependencyClientSources;
  readonly now?: () => number;
  readonly admit?: InvocationAdmit;
  readonly admission?: { readonly acquire: InvocationAdmit };
  readonly hooks?: InvocationHooks<Context>;
  readonly effectRunner?: InvocationRunner;
  readonly bridge?: InvocationRunner;
  readonly idSource?: InvocationIdSource;
}

export class InvocationValidationError extends TypeError {
  readonly code: "ZSYS_INPUT_VALIDATION" | "ZSYS_OUTPUT_VALIDATION";
  readonly phase: "input" | "output";
  readonly issues: readonly StandardIssue[];

  constructor(phase: "input" | "output", issues: readonly StandardIssue[]) {
    super(`${phase === "input" ? "Input" : "Output"} validation failed`);
    this.name = "InvocationValidationError";
    this.code = phase === "input" ? "ZSYS_INPUT_VALIDATION" : "ZSYS_OUTPUT_VALIDATION";
    this.phase = phase;
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
  }
}
