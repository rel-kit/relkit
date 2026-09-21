import type { JsonValue, TracePropagation } from "@relkit/contracts";
import type {
  JobWireEnvelope,
  JobUnknownOutcome,
  RunCancellationReceipt,
  RunHandle,
  RunRetryReceipt,
} from "@relkit/contracts/jobs";

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
  readonly input: JsonValue;
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
export type NativeControlReceipt = RunCancellationReceipt | RunRetryReceipt | JobUnknownOutcome;

export interface NativeWatchRequest {
  readonly runId: string;
  readonly after?: string;
}

export interface NativeCancelRequest {
  readonly runId: string;
  readonly operationId: string;
  readonly reason?: string;
}

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
