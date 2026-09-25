import type { MaybePromise, ProtocolId } from "@relkit/contracts";
import type { StandardSchemaV1 } from "@relkit/schema";
import type { InvocationFailure, PublicFailureEnvelope } from "./failure.types.js";
import type { InvocationValidationError } from "./contracts.js";
import type { InvocationContext, InvocationMetadata } from "./contracts-context.types.js";

export type {
  PublicLogger,
  PublicClock,
  InvocationMetadata,
  InvocationContext,
  InvocationContextOptions,
  InvocationRunner,
} from "./contracts-context.types.js";

/** Public origin of an invocation for policy and telemetry.
 * @example const source: InvocationSource = "http";
 */
export type InvocationSource =
  "direct" | "http" | "job" | "event-delivery" | "event-replay" | "tool" | "agent";
/** Protocol ID kind used by an invocation ID source.
 * @example const kind: InvocationKind = "trace";
 */
export type InvocationKind = "trace" | "invocation" | "span";
/** Source of trace, span, and invocation IDs.
 * A deterministic implementation makes invocation tests repeatable.
 * @example const ids: InvocationIdSource = { next: (kind) => `${kind}-1` as ProtocolId };
 */
export type InvocationIdSource = {
  /** Generates a protocol ID. @param kind - ID kind. @returns A protocol ID. @example ids.next("trace"); */
  readonly next: (kind: InvocationKind) => ProtocolId;
};

/** Declared application error and schema for its data.
 * Only errors listed here may become public application failures.
 * @example const error: InvocationErrorDefinition = { id: "orders.missing", data: errorSchema };
 */
export interface InvocationErrorDefinition {
  readonly id: string;
  readonly data: StandardSchemaV1;
}

/** Defines one callable target and the schemas enforced around its handler.
 * The handler receives validated input and an invocation-scoped context.
 * @typeParam Input - Value produced by the input schema.
 * @typeParam Output - Value accepted by the output schema.
 * @typeParam Context - Public context shape supplied during dispatch.
 * @example
 * const target: InvocationTarget<number, number> = {
 *   id: "math.double", input: numberSchema, output: numberSchema,
 *   handler: (value) => value * 2,
 * };
 */
export interface InvocationTarget<
  Input = unknown,
  Output = unknown,
  Context extends { readonly signal: AbortSignal } = InvocationContext,
> {
  readonly id: string;
  readonly invocationMode?: "callable" | "event-only";
  readonly input: StandardSchemaV1;
  readonly output: StandardSchemaV1;
  readonly progress?: StandardSchemaV1;
  readonly errors?: readonly InvocationErrorDefinition[];
  readonly publications?: Readonly<Record<string, unknown>>;
  readonly publishes?: readonly string[];
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  /** Transforms validated input before the handler runs.
   * @param input - Validated target input.
   * @param context - Invocation context.
   * @returns The input supplied to the handler.
   * @example onBefore: (input) => input;
   */
  readonly onBefore?: (input: Input, context: Context) => MaybePromise<Input>;
  /** Transforms handler output before final validation.
   * @param output - Handler result.
   * @param context - Invocation context.
   * @returns The final output candidate.
   * @example onAfter: (output) => output;
   */
  readonly onAfter?: (output: Output, context: Context) => MaybePromise<Output>;
  /** Runs the target's user operation.
   * @param input - Validated input.
   * @param context - Invocation-scoped context and signal.
   * @returns Output to validate, synchronously or asynchronously.
   * @example handler: async (input) => input;
   */
  readonly handler: (input: Input, context: Context) => MaybePromise<Output>;
}

/** Started or completed record for one invocation.
 * Completion adds its timestamp and duration while retaining the start identity.
 * @example const status = completion.record.status;
 */
export interface InvocationRecord extends InvocationMetadata {
  readonly functionId: string;
  readonly status:
    | "started"
    | "success"
    | "validation-error"
    | "declared-error"
    | "provider-failure"
    | "cancelled"
    | "timeout"
    | "defect";
  readonly completedAt?: string;
  readonly durationMs?: number;
}

/** Persistable trace span record for an invocation.
 * Parent and trace IDs connect this span to the invocation's trace tree.
 * @example function persist(span: SpanRecord) { return span.spanId; }
 */
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

/** Parent identity, deadline, and signal inherited by a child invocation.
 * A child may choose an earlier deadline but must not extend this one.
 * @example const parent: InvocationParent = { id: record.id, traceId: record.traceId, signal };
 */
export interface InvocationParent {
  readonly id: string;
  readonly traceId: string;
  readonly spanId?: string;
  readonly correlationId?: string;
  readonly deadlineMs?: number;
  readonly signal?: AbortSignal;
  readonly trace?: unknown;
}

/** Request to admit a function invocation under concurrency controls.
 * Waiting admission observes the supplied signal and deadline.
 * @example const lease = await admit(request);
 */
export interface InvocationAdmissionRequest {
  readonly functionId: string;
  readonly source: InvocationSource;
  readonly triggerLimit?: number;
  readonly limit?: number;
  readonly deadlineMs?: number;
  readonly signal: AbortSignal;
}

/** Lease that must be released after an admitted invocation finishes.
 * Release returns the concurrency slot even when the handler fails.
 * @example await lease.release();
 */
export interface InvocationLease {
  /** Releases the admission slot. @returns Completion or Promise. @example await lease.release(); */
  readonly release: () => MaybePromise<void>;
}

/** Acquires an optional concurrency lease before an invocation starts.
 * @param request - Function identity, limits, deadline, and cancellation signal.
 * @returns A lease to release after completion, or void when no lease is needed.
 * @example const admit: InvocationAdmit = async () => ({ release: () => undefined });
 */
export type InvocationAdmit = (
  request: InvocationAdmissionRequest,
) => MaybePromise<InvocationLease | void>;

/** Completed invocation delivered to a lifecycle hook.
 * Public error fields are present only for failures.
 * @example function onCompletion(value: InvocationCompletion) { console.log(value.outcome); }
 */
export interface InvocationCompletion {
  readonly record: InvocationRecord;
  readonly outcome: Exclude<InvocationRecord["status"], "started">;
  readonly error?: InvocationValidationError | InvocationFailure;
  readonly publicError?: PublicFailureEnvelope;
}

/** Release hook payload indicating whether admission occurred.
 * Standalone invocations report admitted as false.
 * @example function onRelease(value: InvocationRelease) { console.log(value.admitted); }
 */
export interface InvocationRelease {
  readonly record: InvocationRecord;
  readonly admitted: boolean;
}
