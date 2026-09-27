import type {
  RunCancellationReceipt,
  RunListQuery,
  RunPage,
  RunRetryReceipt,
  RunSnapshot,
  RunWatchFrame,
} from "@relkit/contracts/jobs";
import type { NativeWatchRequest } from "./adapter.js";
import type { JobScheduleClient } from "./job.types.js";
import type { JobObserveOptions } from "./control-support.js";
import type { RunResultOptions } from "./trigger.types.js";
/** Options accepted for job cancel operations. */
export interface JobCancelOptions {
  readonly operationId: string;
  readonly reason?: string;
  readonly signal?: AbortSignal;
}
/** Options accepted for job retry operations. */
export interface JobRetryOptions {
  readonly operationId: string;
  readonly signal?: AbortSignal;
}
/** Run read, observation, cancellation, retry, result, and schedule operations. */
export interface JobsControls {
  readonly get: (
    locator: string,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<RunSnapshot>;
  readonly list: (
    query?: RunListQuery,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<RunPage<RunSnapshot>>;
  readonly observe: (
    request: NativeWatchRequest,
    options?: JobObserveOptions,
  ) => AsyncIterable<RunWatchFrame<RunSnapshot>>;
  readonly cancel: (runId: string, options: JobCancelOptions) => Promise<RunCancellationReceipt>;
  readonly retry: (runId: string, options: JobRetryOptions) => Promise<RunRetryReceipt>;
  readonly result: (runId: string, options: RunResultOptions) => Promise<unknown>;
  readonly schedules?: JobScheduleClient;
}
