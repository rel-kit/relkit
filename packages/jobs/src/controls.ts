import type {
  RunCancellationReceipt,
  RunHandle,
  RunListQuery,
  RunPage,
  RunRetryReceipt,
  RunSnapshot,
  RunWatchFrame,
} from "@relkit/contracts/jobs";
import type { NativeCancelRequest, NativeRetryRequest, NativeWatchRequest } from "./adapter.js";
import { requireJobsRuntime, type JobsRuntime } from "./runtime.js";
import type { RunResultOptions } from "./trigger-types.js";
import { JobControlUnknownError } from "./control-errors.js";
import { createScheduleControls } from "./schedule-controls.js";
import type { JobScheduleClient } from "./job-types.js";
import {
  isTerminal,
  isUnknown,
  normalizeCancellationReceipt,
  normalizeRetryReceipt,
  observeWithTimeout,
  observerTimeout,
  operationContext,
  requireMethod,
  requireOperationId,
  unknownKey,
  unknownRecovery,
  type JobObserveOptions,
} from "./control-support.js";
import { controlWrite } from "./control-write.js";
import { retryOperationIdentity } from "./identity.js";
import { waitForResult as waitForResultInternal } from "./control-result.js";

export type { JobObserveOptions } from "./control-support.js";
export interface JobCancelOptions {
  readonly operationId: string;
  readonly reason?: string;
  readonly signal?: AbortSignal;
}

export interface JobRetryOptions {
  readonly operationId: string;
  readonly signal?: AbortSignal;
}

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

export function createJobsControls(runtime = requireJobsRuntime()): JobsControls {
  return Object.freeze({
    get: (locator: string, options?: { readonly signal?: AbortSignal }) =>
      getRun(runtime, locator, options?.signal),
    list: (query?: RunListQuery, options?: { readonly signal?: AbortSignal }) =>
      listRuns(runtime, query, options?.signal),
    observe: (request: NativeWatchRequest, options?: JobObserveOptions) =>
      observeRun(runtime, request, options),
    cancel: (runId: string, options: JobCancelOptions) => cancelRun(runtime, runId, options),
    retry: (runId: string, options: JobRetryOptions) => retryRun(runtime, runId, options),
    result: (runId: string, options: RunResultOptions) => waitForResult(runtime, runId, options),
    ...(runtime.adapter.schedules === undefined
      ? {}
      : { schedules: createScheduleControls(runtime) }),
  });
}

export async function getRun(
  runtime: JobsRuntime,
  locator: string,
  signal?: AbortSignal,
): Promise<RunSnapshot> {
  requireMethod(runtime, "read", "get");
  const context = operationContext(runtime, signal);
  return runtime.adapter.get(locator, context);
}

export async function listRuns(
  runtime: JobsRuntime,
  query: RunListQuery = {},
  signal?: AbortSignal,
): Promise<RunPage<RunSnapshot>> {
  requireMethod(runtime, "list", "list");
  const limit = query.limit ?? 25;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new RangeError("Run list limit must be between 1 and 100");
  return runtime.adapter.list({ ...query, limit }, operationContext(runtime, signal));
}

export function observeRun(
  runtime: JobsRuntime,
  request: NativeWatchRequest,
  options: JobObserveOptions = {},
): AsyncIterable<RunWatchFrame<RunSnapshot>> {
  requireMethod(runtime, "observation", "observe");
  const signal = options.signal ?? new AbortController().signal;
  return observeWithTimeout(
    runtime.adapter.observe(request, operationContext(runtime, signal)),
    signal,
    observerTimeout(runtime, options.timeout),
  );
}

export async function cancelRun(
  runtime: JobsRuntime,
  runId: string,
  options: JobCancelOptions,
): Promise<RunCancellationReceipt> {
  requireOperationId(options.operationId);
  requireMethod(runtime, "cancel", "cancel");
  const request: NativeCancelRequest = {
    runId,
    operationId: options.operationId,
    ...(options.reason === undefined ? {} : { reason: options.reason }),
  };
  const value: unknown = await controlWrite(
    () =>
      runtime.adapter.cancel(
        request,
        operationContext(runtime, options.signal, options.operationId),
      ),
    options.signal,
    options.operationId,
  );
  if (isUnknown(value))
    throw new JobControlUnknownError(value.operationId, unknownKey(value), unknownRecovery(value));
  return normalizeCancellationReceipt(value, runId, options.operationId);
}

export async function retryRun(
  runtime: JobsRuntime,
  runId: string,
  options: JobRetryOptions,
): Promise<RunRetryReceipt> {
  requireOperationId(options.operationId);
  requireMethod(runtime, "retry", "retry");
  const retry = runtime.adapter.retry;
  if (typeof retry !== "function") throw new TypeError("Native retry operation is unavailable");
  const original = await getRun(runtime, runId, options.signal);
  const request: NativeRetryRequest = {
    runId,
    operationId: options.operationId,
    retryIdentity: retryOperationIdentity(runId, options.operationId),
    ...(original.taskId === undefined ? {} : { taskId: original.taskId }),
    ...(original.jobId === undefined ? {} : { jobId: original.jobId }),
    ...(original.taskVersion === undefined ? {} : { taskVersion: original.taskVersion }),
    ...(original.buildId === undefined ? {} : { buildId: original.buildId }),
    ...(original.scope === undefined ? {} : { scope: original.scope }),
    ...(original.inputHash === undefined ? {} : { inputHash: original.inputHash }),
    ...(original.inputSchemaHash === undefined
      ? {}
      : { inputSchemaHash: original.inputSchemaHash }),
    ...(original.acceptanceIdentity === undefined
      ? {}
      : { acceptanceIdentity: original.acceptanceIdentity }),
    canonicalAdmission: {
      validatePinnedInput: true,
      allocateFreshBudget: true,
      clearInitialDelay: true,
    },
  };
  const value: unknown = await controlWrite(
    () => retry(request, operationContext(runtime, options.signal, options.operationId)),
    options.signal,
    options.operationId,
  );
  if (isUnknown(value))
    throw new JobControlUnknownError(value.operationId, unknownKey(value), unknownRecovery(value));
  return normalizeRetryReceipt(value, runId);
}

export async function waitForResult(
  runtime: JobsRuntime,
  runId: string,
  options: RunResultOptions,
): Promise<unknown> {
  return waitForResultInternal(runtime, runId, options, getRun);
}
