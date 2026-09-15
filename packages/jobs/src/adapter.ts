import type {
  JobWireEnvelope,
  JobUnknownOutcome,
  ProgressEmitReceipt,
  RunCancellationReceipt,
  RunHandle,
  RunListQuery,
  RunPage,
  RunRetryReceipt,
  RunSnapshot,
  RunWatchFrame,
} from "@relkit/contracts/jobs";
import { JOBS_PROTOCOL_VERSION } from "@relkit/contracts/jobs";
import type { JsonValue, MaybePromise, TracePropagation } from "@relkit/contracts";
import {
  assertAdapterMethods,
  type JobsCapabilityReport,
  validateJobsCapabilityReport,
} from "./capabilities.js";

export const JOBS_ADAPTER_PROTOCOL_VERSION = JOBS_PROTOCOL_VERSION;

export type { JobsCapabilityReport } from "./capabilities.js";
export { JobsCapabilityError, assertAdapterMethods, assertJobsCapability, validateJobsCapabilityReport } from "./capabilities.js";

export interface OperationContext {
  readonly signal: AbortSignal;
  readonly application: string;
  readonly environment: string;
  readonly scope: string;
  readonly service: string;
  readonly serviceGeneration: string;
  readonly operationId?: string;
  readonly deadlineMs?: number;
  readonly correlationId?: string;
  readonly parentRunId?: string;
  readonly propagation?: TracePropagation;
  readonly acceptanceIdentity?: string;
  readonly occurrenceIdentity?: string;
  readonly inputSchemaHash?: string;
  readonly retryOfRunId?: string;
}

export interface NativeSubmission {
  readonly jobId: string;
  readonly taskId: string;
  readonly taskVersion: string;
  readonly buildId: string;
  readonly execution?: "durable" | "retryable";
  readonly scope?: string;
  readonly input: import("@relkit/contracts").JsonValue;
  readonly operationId: string;
  readonly idempotencyKey?: string;
  readonly canonicalInput?: JobWireEnvelope;
  readonly inputHash?: string;
  readonly inputSchemaHash?: string;
  readonly policy?: JsonValue;
  readonly scheduledFor?: string;
  readonly tags?: readonly string[];
  readonly correlationId?: string;
  readonly parentRunId?: string;
  readonly propagation?: TracePropagation;
  readonly acceptanceIdentity?: string;
  readonly occurrenceIdentity?: string;
  readonly retryOfRunId?: string;
}

export type NativeReceipt = RunHandle | JobUnknownOutcome;
export type NativeRun = RunSnapshot;
export type NativeRunQuery = RunListQuery;
export type NativeRunPage = RunPage<NativeRun>;
export type NativeObservation = RunWatchFrame<NativeRun>;
export type NativeLocator = string;
export interface NativeWatchRequest {
  readonly runId: string;
  readonly after?: string;
}
export interface NativeCancelRequest {
  readonly runId: string;
  readonly operationId: string;
  readonly reason?: string;
}
export type NativeControlReceipt =
  | RunCancellationReceipt
  | RunRetryReceipt
  | JobUnknownOutcome;

export interface NativeRetryRequest {
  readonly runId: string;
  readonly operationId: string;
  readonly retryIdentity?: string;
  readonly canonicalInput?: JobWireEnvelope;
  readonly inputHash?: string;
  readonly inputSchemaHash?: string;
  readonly taskId?: string;
  readonly jobId?: string;
  readonly taskVersion?: string;
  readonly buildId?: string;
  readonly scope?: string;
  readonly acceptanceIdentity?: string;
  readonly canonicalAdmission?: {
    readonly validatePinnedInput: true;
    readonly allocateFreshBudget: true;
    readonly clearInitialDelay: true;
  };
}

export interface NativeScheduleOperations {
  readonly list: (query: Readonly<Record<string, unknown>>, context: OperationContext) => Promise<unknown>;
  readonly get: (id: string, context: OperationContext) => Promise<unknown>;
  readonly upsert: (definition: JsonValue, context: OperationContext) => Promise<unknown>;
  readonly pause: (id: string, context: OperationContext) => Promise<unknown>;
  readonly resume: (id: string, context: OperationContext) => Promise<unknown>;
  readonly delete: (id: string, context: OperationContext) => Promise<unknown>;
}

export interface NativeProgressWriter {
  readonly emit: (value: JsonValue, context?: OperationContext) => MaybePromise<ProgressEmitReceipt | void>;
}

export interface NativeStreamWriter {
  readonly emit: (value: JsonValue, context?: OperationContext) => MaybePromise<ProgressEmitReceipt | void>;
}

export type NativeStreamWriters = Readonly<Record<string, NativeStreamWriter>>;

export interface NativeDurableSleep {
  readonly sleep: (key: string, durationMs: number) => Promise<void>;
  readonly sleepUntil?: (key: string, instant: string) => Promise<void>;
}

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
  readonly propagation?: TracePropagation;
}

export interface TaskExecutor {
  readonly execute: (envelope: TaskExecutionEnvelope, binding: TaskExecutionBinding) => Promise<unknown>;
}

export interface JobsAdapterRuntime {
  readonly kind: "jobs-adapter-runtime";
  readonly protocolVersion: typeof JOBS_ADAPTER_PROTOCOL_VERSION;
  readonly capabilities: JobsCapabilityReport;
  readonly submit: (request: NativeSubmission, context: OperationContext) => Promise<NativeReceipt>;
  readonly get: (locator: NativeLocator, context: OperationContext) => Promise<NativeRun>;
  readonly list: (query: NativeRunQuery, context: OperationContext) => Promise<NativeRunPage>;
  readonly observe: (
    request: NativeWatchRequest,
    context: OperationContext,
  ) => AsyncIterable<NativeObservation>;
  readonly cancel: (request: NativeCancelRequest, context: OperationContext) => Promise<NativeControlReceipt>;
  readonly retry?: (request: NativeRetryRequest, context: OperationContext) => Promise<NativeControlReceipt>;
  readonly close: () => Promise<void>;
  readonly worker?: NativeTaskWorker;
  readonly schedules?: NativeScheduleOperations;
  readonly streams?: Readonly<Record<string, unknown>>;
}

export interface NativeTaskWork {
  readonly envelope: TaskExecutionEnvelope;
  readonly binding: TaskExecutionBinding;
}

export interface NativeTaskWorker {
  readonly next: (context: OperationContext) => Promise<NativeTaskWork | undefined>;
  readonly complete: (runId: string, output: unknown, context: OperationContext) => Promise<void>;
  readonly fail: (runId: string, error: unknown, context: OperationContext) => Promise<void>;
  /** Returns an intentional provider park/yield to the native continuation owner. */
  readonly suspend?: (runId: string, value: unknown, context: OperationContext) => Promise<void>;
}

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
    readonly propagation?: TracePropagation;
  };
  readonly signal: AbortSignal;
  readonly isSuspension?: (cause: unknown) => boolean;
  readonly sleep?: NativeDurableSleep;
  readonly progress?: NativeProgressWriter;
  readonly streams?: NativeStreamWriters;
}

export function assertJobsAdapterRuntime(value: unknown): asserts value is JobsAdapterRuntime {
  if (value === null || typeof value !== "object") {
    throw new TypeError("Jobs adapter runtime must be an object");
  }
  const adapter = value as JobsAdapterRuntime;
  if (adapter.kind !== "jobs-adapter-runtime") {
    throw new TypeError("Jobs adapter runtime has an invalid kind");
  }
  if (adapter.protocolVersion !== JOBS_ADAPTER_PROTOCOL_VERSION) {
    throw new TypeError(`Unsupported jobs adapter protocol ${String(adapter.protocolVersion)}`);
  }
  validateJobsCapabilityReport(adapter.capabilities);
  assertAdapterMethods(adapter);
}

export function isJobsAdapterRuntime(value: unknown): value is JobsAdapterRuntime {
  return value !== null && typeof value === "object" &&
    (value as { readonly kind?: unknown }).kind === "jobs-adapter-runtime";
}
