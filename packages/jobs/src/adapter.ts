import type {
  JobUnknownOutcome,
  RunCancellationReceipt,
  RunHandle,
  RunListQuery,
  RunPage,
  RunRetryReceipt,
  RunSnapshot,
  RunWatchFrame,
} from "@relkit/contracts/jobs";
import { JOBS_PROTOCOL_VERSION } from "@relkit/contracts/jobs";

export const JOBS_ADAPTER_PROTOCOL_VERSION = JOBS_PROTOCOL_VERSION;

export interface JobsCapabilityReport {
  readonly service: string;
  readonly features: Readonly<Record<string, boolean>>;
}

export interface OperationContext {
  readonly signal: AbortSignal;
  readonly application: string;
  readonly environment: string;
  readonly service: string;
  readonly serviceGeneration: string;
  readonly operationId?: string;
}

export interface NativeSubmission {
  readonly jobId: string;
  readonly taskId: string;
  readonly taskVersion: string;
  readonly buildId: string;
  readonly input: import("@relkit/contracts").JsonValue;
  readonly operationId: string;
  readonly idempotencyKey?: string;
}

export type NativeReceipt = RunHandle | JobUnknownOutcome;
export type NativeRun = RunSnapshot;
export type NativeRunQuery = RunListQuery;
export type NativeRunPage = RunPage<NativeRun>;
export type NativeObservation = RunWatchFrame<NativeRun>;
export type NativeControlReceipt =
  | RunCancellationReceipt
  | RunRetryReceipt
  | JobUnknownOutcome;

export interface JobsAdapterRuntime {
  readonly kind: "jobs-adapter-runtime";
  readonly protocolVersion: typeof JOBS_ADAPTER_PROTOCOL_VERSION;
  readonly capabilities: JobsCapabilityReport;
  readonly submit: (request: NativeSubmission, context: OperationContext) => Promise<NativeReceipt>;
  readonly get: (locator: string, context: OperationContext) => Promise<NativeRun>;
  readonly list: (query: NativeRunQuery, context: OperationContext) => Promise<NativeRunPage>;
  readonly observe: (
    request: { readonly runId: string; readonly after?: string },
    context: OperationContext,
  ) => AsyncIterable<NativeObservation>;
  readonly cancel: (
    request: { readonly runId: string; readonly operationId: string; readonly reason?: string },
    context: OperationContext,
  ) => Promise<NativeControlReceipt>;
  readonly close: () => Promise<void>;
}

export interface TaskExecutionBinding {
  readonly run: {
    readonly runId: string;
    readonly taskId: string;
    readonly taskVersion: string;
    readonly buildId: string;
  };
  readonly signal: AbortSignal;
  readonly isSuspension?: (cause: unknown) => boolean;
}
