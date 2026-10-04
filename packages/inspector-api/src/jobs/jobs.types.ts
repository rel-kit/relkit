import type { JsonValue, MaybePromise } from "@relkit/contracts";
import type {
  RunCancellationReceipt,
  RunListQuery,
  RunPage,
  RunRetryReceipt,
  RunSnapshot,
  RunWatchFrame,
} from "@relkit/contracts/jobs";

/** Declared native Inspector privilege categories. */
export type InspectorJobsOperation = "read" | "control" | "schedule";

/** Native operation identity and request signal forwarded without claiming unsupported cancellation. */
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

/** Declared native filter, feature and numeric-limit support; missing capabilities remain unknown. */
export interface InspectorJobsCapabilities {
  readonly filters?: readonly string[];
  readonly features?: Readonly<Record<string, boolean>>;
  readonly limits?: Readonly<Record<string, number>>;
}

/** Native schedule read and administration authorities with explicit operation contexts. */
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

/** One native service generation and its declared run, schedule and health capabilities. */
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

/** Native privilege request checked before jobs reads or administration. */
export interface InspectorJobsPrivilegeRequest {
  readonly operation: InspectorJobsOperation;
  readonly request: Request;
  readonly service?: string;
}

/** Ordered native binding sources with optional privilege, cursor-signing and finite read policies. */
export interface InspectorJobsServices {
  readonly bindings:
    readonly InspectorJobsBinding[] | (() => MaybePromise<readonly InspectorJobsBinding[]>);
  readonly authorize?: (request: InspectorJobsPrivilegeRequest) => MaybePromise<boolean>;
  readonly cursorSecret?: string | Uint8Array;
  readonly maxReadConcurrency?: number;
}
