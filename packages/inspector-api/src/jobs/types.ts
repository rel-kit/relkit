import type { JsonValue, MaybePromise } from "@relkit/contracts";
import type {
  JobRunStatus,
  RunCancellationReceipt,
  RunListQuery,
  RunPage,
  RunRetryReceipt,
  RunSnapshot,
  RunWatchFrame,
} from "@relkit/contracts/jobs";

export type InspectorJobsOperation = "read" | "control" | "schedule";

export interface InspectorJobsOperationContext {
  readonly operation: InspectorJobsOperation;
  readonly signal: AbortSignal;
  readonly privilege: "inspector";
  readonly application: string;
  readonly environment: string;
  readonly service: string;
  readonly serviceGeneration: string;
  readonly operationId?: string;
}

export interface InspectorJobsCapabilities {
  readonly filters?: readonly string[];
  readonly features?: Readonly<Record<string, boolean>>;
  readonly limits?: Readonly<Record<string, number>>;
}

export interface InspectorScheduleOperations {
  readonly list: (
    query: Readonly<Record<string, unknown>>,
    context: InspectorJobsOperationContext,
  ) => MaybePromise<JsonValue>;
  readonly get: (id: string, context: InspectorJobsOperationContext) => MaybePromise<JsonValue>;
  readonly upsert: (
    definition: JsonValue,
    context: InspectorJobsOperationContext,
  ) => MaybePromise<JsonValue>;
  readonly pause: (id: string, context: InspectorJobsOperationContext) => MaybePromise<JsonValue>;
  readonly resume: (id: string, context: InspectorJobsOperationContext) => MaybePromise<JsonValue>;
  readonly delete: (id: string, context: InspectorJobsOperationContext) => MaybePromise<JsonValue>;
}

export interface InspectorJobsBinding {
  readonly service: string;
  readonly serviceGeneration: string;
  readonly provider?: string;
  readonly capabilities?: InspectorJobsCapabilities;
  readonly list: (
    query: RunListQuery,
    context: InspectorJobsOperationContext,
  ) => MaybePromise<RunPage<RunSnapshot>>;
  readonly get: (
    runId: string,
    context: InspectorJobsOperationContext,
  ) => MaybePromise<RunSnapshot>;
  readonly observe?: (
    runId: string,
    after: string | undefined,
    context: InspectorJobsOperationContext,
  ) => MaybePromise<AsyncIterable<RunWatchFrame<RunSnapshot>>>;
  readonly cancel?: (
    runId: string,
    operationId: string,
    reason: string | undefined,
    context: InspectorJobsOperationContext,
  ) => MaybePromise<RunCancellationReceipt>;
  readonly retry?: (
    runId: string,
    operationId: string,
    context: InspectorJobsOperationContext,
  ) => MaybePromise<RunRetryReceipt>;
  readonly schedules?: InspectorScheduleOperations;
  readonly health?: () => MaybePromise<JsonValue>;
}

export interface InspectorJobsPrivilegeRequest {
  readonly operation: InspectorJobsOperation;
  readonly request: Request;
  readonly service?: string;
}

export interface InspectorJobsServices {
  readonly bindings:
    readonly InspectorJobsBinding[] | (() => MaybePromise<readonly InspectorJobsBinding[]>);
  readonly authorize?: (request: InspectorJobsPrivilegeRequest) => MaybePromise<boolean>;
  readonly cursorSecret?: string | Uint8Array;
  readonly maxReadConcurrency?: number;
}

export class InspectorJobsError extends Error {
  constructor(
    readonly code:
      | "RELKIT_INSPECTOR_JOBS_UNAVAILABLE"
      | "RELKIT_INSPECTOR_JOBS_FORBIDDEN"
      | "RELKIT_INSPECTOR_JOBS_NOT_FOUND"
      | "RELKIT_INSPECTOR_JOBS_FILTER_INVALID"
      | "RELKIT_INSPECTOR_JOBS_FILTER_UNSUPPORTED"
      | "RELKIT_INSPECTOR_JOBS_CURSOR_INVALID"
      | "RELKIT_INSPECTOR_JOBS_OPERATION_UNSUPPORTED"
      | "RELKIT_INSPECTOR_JOBS_OPERATION_INVALID",
    readonly status: 400 | 403 | 404 | 409 | 501 | 503,
    message: string = code,
  ) {
    super(message);
    this.name = "InspectorJobsError";
  }
}

export const TERMINAL_RUN_STATES: readonly JobRunStatus[] = [
  "completed",
  "failed",
  "cancelled",
  "timed-out",
];
