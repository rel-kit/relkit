import type { JsonValue, MaybePromise, TracePropagation } from "@relkit/contracts";
import type {
  JobWireEnvelope,
  ProgressEmitReceipt,
  RunListQuery,
  RunPage,
  RunSnapshot,
  RunWatchFrame,
} from "@relkit/contracts/jobs";
import { JOBS_PROTOCOL_VERSION } from "@relkit/contracts/jobs";
import type { JobsCapabilityReport } from "./capabilities.types.js";
import type {
  NativeCancelRequest,
  NativeControlReceipt,
  NativeReceipt,
  NativeRetryRequest,
  NativeSubmission,
  NativeWatchRequest,
  OperationContext,
} from "./adapter-requests.types.js";
/** Provider-facing run contract at the adapter boundary. */
export type NativeRun = RunSnapshot;
/** Provider-facing run query contract at the adapter boundary. */
export type NativeRunQuery = RunListQuery;
/** Provider-facing run page contract at the adapter boundary. */
export type NativeRunPage = RunPage<NativeRun>;
/** Provider-facing observation contract at the adapter boundary. */
export type NativeObservation = RunWatchFrame<NativeRun>;
/** Provider-facing locator contract at the adapter boundary. */
export type NativeLocator = string;
/** Provider-facing schedule operations contract at the adapter boundary. */
export interface NativeScheduleOperations {
  readonly list: (
    query: Readonly<Record<string, unknown>>,
    context: OperationContext,
  ) => Promise<unknown>;
  readonly get: (id: string, context: OperationContext) => Promise<unknown>;
  readonly upsert: (definition: JsonValue, context: OperationContext) => Promise<unknown>;
  readonly pause: (id: string, context: OperationContext) => Promise<unknown>;
  readonly resume: (id: string, context: OperationContext) => Promise<unknown>;
  readonly delete: (id: string, context: OperationContext) => Promise<unknown>;
}
/** Provider-facing progress writer contract at the adapter boundary. */
export interface NativeProgressWriter {
  readonly emit: (
    value: JsonValue,
    context?: OperationContext,
  ) => MaybePromise<ProgressEmitReceipt | void>;
}
/** Provider-facing stream writer contract at the adapter boundary. */
export interface NativeStreamWriter {
  readonly emit: (
    value: JsonValue,
    context?: OperationContext,
  ) => MaybePromise<ProgressEmitReceipt | void>;
}
/** Provider-facing stream writers contract at the adapter boundary. */
export type NativeStreamWriters = Readonly<Record<string, NativeStreamWriter>>;
/** Provider-facing durable sleep contract at the adapter boundary. */
export interface NativeDurableSleep {
  readonly sleep: (key: string, durationMs: number) => Promise<void>;
  readonly sleepUntil?: (key: string, instant: string) => Promise<void>;
}
/** Provider-owned envelope containing the accepted task input and run identity. */
export interface TaskExecutionEnvelope {
  readonly runId: string;
  readonly jobId: string;
  readonly taskId: string;
  readonly taskVersion: string;
  readonly buildId: string;
  readonly input: JobWireEnvelope;
  readonly inputHash?: string;
  readonly inputSchemaHash?: string;
  readonly acceptedAt?: string;
  readonly scheduledFor?: string;
  readonly attempt?: number;
  readonly parentRunId?: string;
  readonly service?: string;
  readonly serviceGeneration?: string;
  readonly scope?: string;
  readonly acceptanceIdentity?: string;
  readonly occurrenceIdentity?: string;
  readonly propagation?: TracePropagation;
}
/** Execution callback used by a native task worker. */
export interface TaskExecutor {
  readonly execute: (
    envelope: TaskExecutionEnvelope,
    binding: TaskExecutionBinding,
  ) => Promise<unknown>;
}
/** Provider protocol for submitting, reading, controlling, and observing jobs. */
export interface JobsAdapterRuntime {
  readonly kind: "jobs-adapter-runtime";
  readonly protocolVersion: typeof JOBS_PROTOCOL_VERSION;
  readonly capabilities: JobsCapabilityReport;
  readonly submit: (request: NativeSubmission, context: OperationContext) => Promise<NativeReceipt>;
  readonly get: (locator: NativeLocator, context: OperationContext) => Promise<NativeRun>;
  readonly list: (query: NativeRunQuery, context: OperationContext) => Promise<NativeRunPage>;
  readonly observe: (
    request: NativeWatchRequest,
    context: OperationContext,
  ) => AsyncIterable<NativeObservation>;
  readonly cancel: (
    request: NativeCancelRequest,
    context: OperationContext,
  ) => Promise<NativeControlReceipt>;
  readonly retry?: (
    request: NativeRetryRequest,
    context: OperationContext,
  ) => Promise<NativeControlReceipt>;
  readonly close: () => Promise<void>;
  readonly worker?: NativeTaskWorker;
  readonly schedules?: NativeScheduleOperations;
  readonly streams?: Readonly<Record<string, unknown>>;
}
/** Provider-facing task work contract at the adapter boundary. */
export interface NativeTaskWork {
  readonly envelope: TaskExecutionEnvelope;
  readonly binding: TaskExecutionBinding;
}
/** Provider worker operations for accepting and completing task work. */
export interface NativeTaskWorker {
  readonly next: (context: OperationContext) => Promise<NativeTaskWork | undefined>;
  readonly complete: (runId: string, output: unknown, context: OperationContext) => Promise<void>;
  readonly fail: (runId: string, error: unknown, context: OperationContext) => Promise<void>;
  /** Returns an intentional provider park/yield to the native continuation owner. */
  readonly suspend?: (runId: string, value: unknown, context: OperationContext) => Promise<void>;
}
/** Provider-owned context and sinks supplied to one task execution. */
export interface TaskExecutionBinding {
  readonly run: {
    readonly runId: string;
    readonly jobId: string;
    readonly taskId: string;
    readonly taskVersion: string;
    readonly buildId: string;
    readonly service?: string;
    readonly serviceGeneration?: string;
    readonly attempt?: number;
    readonly acceptedAt?: string;
    readonly scheduledFor?: string;
    readonly parentRunId?: string;
    readonly deadlineMs?: number;
    readonly scope?: string;
    readonly inputSchemaHash?: string;
    readonly acceptanceIdentity?: string;
    readonly occurrenceIdentity?: string;
    readonly propagation?: TracePropagation;
  };
  readonly signal: AbortSignal;
  readonly isSuspension?: (cause: unknown) => boolean;
  readonly sleep?: NativeDurableSleep;
  readonly progress?: NativeProgressWriter;
  readonly streams?: NativeStreamWriters;
}
