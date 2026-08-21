import type { FunctionRequest, MaybePromise, ProtocolId } from "@zsys/contracts";
import type { StandardIssue, StandardSchemaV1 } from "@zsys/schema";
import { Effect } from "effect";
import type { InvocationFailure, PublicFailureEnvelope } from "./failure-types.js";

export type InvocationSource = "direct" | "http" | "job" | "event" | "tool" | "agent";
export type InvocationKind = "trace" | "invocation" | "span";
export type InvocationIdSource = { readonly next: (kind: InvocationKind) => ProtocolId };

export interface PublicLogger {
  readonly trace: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
  readonly debug: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
  readonly info: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
  readonly warn: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
  readonly error: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
}

export interface PublicClock {
  readonly now: () => Date;
  readonly sleep: (milliseconds: number) => Promise<void>;
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
  readonly serviceId?: string;
}

export interface InvocationContext {
  readonly invocation: InvocationMetadata;
  readonly signal: AbortSignal;
  readonly env: Readonly<Record<string, unknown>>;
  readonly log: PublicLogger;
  readonly time: PublicClock;
  readonly jobs: Readonly<Record<string, never>>;
  readonly events: Readonly<Record<string, never>>;
  readonly buckets: Readonly<Record<string, never>>;
  readonly cache: Readonly<Record<string, never>>;
  readonly agents: Readonly<Record<string, never>>;
  readonly service: Readonly<Record<string, unknown>>;
}

export interface InvocationErrorDefinition {
  readonly id: string;
  readonly data: StandardSchemaV1;
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
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly handler: (
    input: Input,
    request: FunctionRequest | undefined,
    context: Context,
  ) => MaybePromise<Output>;
}

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

export interface InvocationParent {
  readonly id: string;
  readonly traceId: string;
  readonly spanId?: string;
  readonly correlationId?: string;
  readonly deadlineMs?: number;
  readonly signal?: AbortSignal;
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

export interface InvocationRunner {
  readonly run: <A, E>(
    effect: Effect.Effect<A, E, never>,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<A>;
}

export interface InvocationCompletion {
  readonly record: InvocationRecord;
  readonly outcome: Exclude<InvocationRecord["status"], "started">;
  readonly error?: InvocationValidationError | InvocationFailure;
  readonly publicError?: PublicFailureEnvelope;
}

export interface InvocationRelease {
  readonly record: InvocationRecord;
  readonly admitted: boolean;
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
