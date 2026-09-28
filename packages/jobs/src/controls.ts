import type {
  RunCancellationReceipt,
  RunListQuery,
  RunPage,
  RunRetryReceipt,
  RunSnapshot,
} from "@relkit/contracts/jobs";
import { Effect, Result, Schema } from "effect";
import { observeJobs } from "./jobs-observability.js";
import {
  resultRunReaderLayer,
  waitForResultEffect as waitForResultInternalEffect,
} from "./control-result.js";
import type { JobsRuntime } from "./runtime.js";
import type { RunResultOptions } from "./trigger.types.js";
import type { JobCancelOptions, JobRetryOptions } from "./controls.types.js";
import { cancelRunOperationEffect, retryRunOperationEffect } from "./controls-write-operations.js";
import { getRunOperationEffect, getRunValue, listRunsOperationEffect } from "./controls-read.js";
export type { JobCancelOptions, JobRetryOptions, JobsControls } from "./controls.types.js";
export type { JobObserveOptions } from "./control-support.js";
/** Expected failure while reading or changing a job run.
 * @example if (error instanceof JobControlFailure) console.log(error.message);
 */
export class JobControlFailure extends Schema.TaggedError<JobControlFailure>()(
  "Jobs.ControlFailure",
  { cause: Schema.Defect() },
) {}
export { createJobsControls, createJobsControlsEffect } from "./controls-factory.js";
/** Reads a native run in Effect.
 * @param runtime - Jobs runtime.
 * @param locator - Native run locator.
 * @param signal - Optional cancellation signal.
 * @returns A snapshot or JobControlFailure.
 * @example Effect.runPromise(getRunEffect(runtime, "run-1"));
 */
export const getRunEffect = Effect.fn("Jobs.getRun")(
  (runtime: JobsRuntime, locator: string, signal?: AbortSignal) =>
    observeJobs(
      "control.get",
      Effect.mapError(
        getRunOperationEffect(runtime, locator, signal),
        (error) => new JobControlFailure({ cause: error.cause }),
      ),
    ),
);
/** Promise compatibility adapter for native run reads.
 * @param runtime - Jobs runtime.
 * @param locator - Native run locator.
 * @param signal - Optional cancellation signal.
 * @returns A snapshot.
 * @throws The original provider or capability error.
 * @example await getRun(runtime, "run-1");
 */
export function getRun(
  runtime: JobsRuntime,
  locator: string,
  signal?: AbortSignal,
): Promise<RunSnapshot> {
  return runControl(getRunEffect(runtime, locator, signal));
}
/** Lists native runs in Effect.
 * @param runtime - Jobs runtime.
 * @param query - Run filters and page limit.
 * @param signal - Optional cancellation signal.
 * @returns A page or JobControlFailure.
 * @example Effect.runPromise(listRunsEffect(runtime));
 */
export const listRunsEffect = Effect.fn("Jobs.listRuns")(
  (runtime: JobsRuntime, query: RunListQuery = {}, signal?: AbortSignal) =>
    observeJobs(
      "control.list",
      Effect.mapError(
        listRunsOperationEffect(runtime, query, signal),
        (error) => new JobControlFailure({ cause: error.cause }),
      ),
    ),
);
/** Promise compatibility adapter for native run listings.
 * @param runtime - Jobs runtime.
 * @param query - Run filters and page limit.
 * @param signal - Optional cancellation signal.
 * @returns A page of runs.
 * @throws The original provider, capability, or limit error.
 * @example await listRuns(runtime);
 */
export function listRuns(
  runtime: JobsRuntime,
  query: RunListQuery = {},
  signal?: AbortSignal,
): Promise<RunPage<RunSnapshot>> {
  return runControl(listRunsEffect(runtime, query, signal));
}
export { observeRun, observeRunEffect } from "./controls-observe.js";
/** Cancels a run in Effect.
 * @param runtime - Jobs runtime.
 * @param runId - Run identifier.
 * @param options - Idempotent control options.
 * @returns A cancellation receipt or JobControlFailure.
 * @example Effect.runPromise(cancelRunEffect(runtime, "run-1", { operationId: "op" }));
 */
export const cancelRunEffect = Effect.fn("Jobs.cancelRun")(
  (runtime: JobsRuntime, runId: string, options: JobCancelOptions) =>
    observeJobs(
      "control.cancel",
      Effect.mapError(
        cancelRunOperationEffect(runtime, runId, options),
        (error) => new JobControlFailure({ cause: error.cause }),
      ),
    ),
);
/** Promise compatibility adapter for cancellation.
 * @param runtime - Jobs runtime.
 * @param runId - Run identifier.
 * @param options - Idempotent control options.
 * @returns A cancellation receipt.
 * @throws The original provider or control error.
 * @example await cancelRun(runtime, "run-1", { operationId: "op" });
 */
export function cancelRun(
  runtime: JobsRuntime,
  runId: string,
  options: JobCancelOptions,
): Promise<RunCancellationReceipt> {
  return runControl(cancelRunEffect(runtime, runId, options));
}
/** Retries a run in Effect.
 * @param runtime - Jobs runtime.
 * @param runId - Original run identifier.
 * @param options - Idempotent control options.
 * @returns A retry receipt or JobControlFailure.
 * @example Effect.runPromise(retryRunEffect(runtime, "run-1", { operationId: "op" }));
 */
export const retryRunEffect = Effect.fn("Jobs.retryRun")(
  (runtime: JobsRuntime, runId: string, options: JobRetryOptions) =>
    observeJobs(
      "control.retry",
      Effect.mapError(
        retryRunOperationEffect(runtime, runId, options),
        (error) => new JobControlFailure({ cause: error.cause }),
      ),
    ),
);
/** Promise compatibility adapter for retry.
 * @param runtime - Jobs runtime.
 * @param runId - Original run identifier.
 * @param options - Idempotent control options.
 * @returns A retry receipt.
 * @throws The original provider or control error.
 * @example await retryRun(runtime, "run-1", { operationId: "op" });
 */
export function retryRun(
  runtime: JobsRuntime,
  runId: string,
  options: JobRetryOptions,
): Promise<RunRetryReceipt> {
  return runControl(retryRunEffect(runtime, runId, options));
}
/** Waits for a run result in Effect.
 * @param runtime - Jobs runtime.
 * @param runId - Run identifier.
 * @param options - Timeout and signal options.
 * @returns The result or JobControlFailure.
 * @example Effect.runPromise(waitForResultEffect(runtime, "run-1", { timeout: "1 second" }));
 */
export const waitForResultEffect = Effect.fn("Jobs.waitForResult")(
  (runtime: JobsRuntime, runId: string, options: RunResultOptions) =>
    observeJobs(
      "control.result",
      Effect.mapError(
        Effect.provide(
          waitForResultInternalEffect(runtime, runId, options),
          resultRunReaderLayer(getRunValue),
        ),
        (failure) => new JobControlFailure({ cause: failure.cause }),
      ),
    ),
);
/** Promise compatibility adapter for result waiting.
 * @param runtime - Jobs runtime.
 * @param runId - Run identifier.
 * @param options - Timeout and signal options.
 * @returns The result value.
 * @throws The original observation or result error.
 * @example await waitForResult(runtime, "run-1", { timeout: "1 second" });
 */
export function waitForResult(
  runtime: JobsRuntime,
  runId: string,
  options: RunResultOptions,
): Promise<unknown> {
  return runControl(waitForResultEffect(runtime, runId, options));
}
/** Preserves original errors for Promise compatibility callers. */
async function runControl<A>(effect: Effect.Effect<A, JobControlFailure>): Promise<A> {
  const result = await Effect.runPromise(Effect.result(effect));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
