import type { RunListQuery } from "@relkit/contracts/jobs";
import type { NativeWatchRequest } from "./adapter.js";
import { Effect } from "effect";
import type { JobObserveOptions } from "./control-support.js";
import { getRun, listRuns, observeRun, cancelRun, retryRun, waitForResult } from "./controls.js";
import type { JobCancelOptions, JobRetryOptions, JobsControls } from "./controls.types.js";
import { observeJobs } from "./jobs-observability.js";
import { requireJobsRuntime, type JobsRuntime } from "./runtime.js";
import { createScheduleControls } from "./schedule-controls.js";
import type { RunResultOptions } from "./trigger.types.js";
/** Builds a run controls facade in Effect.
 * @param runtime - Runtime owning the native provider.
 * @returns A frozen controls facade; no expected failure.
 * @example Effect.runSync(createJobsControlsEffect(runtime));
 */
export const createJobsControlsEffect = Effect.fn("Jobs.createControls")((runtime: JobsRuntime) =>
  observeJobs(
    "control.create",
    Effect.sync(
      () =>
        Object.freeze({
          get: (locator: string, options?: { readonly signal?: AbortSignal }) =>
            getRun(runtime, locator, options?.signal),
          list: (query?: RunListQuery, options?: { readonly signal?: AbortSignal }) =>
            listRuns(runtime, query, options?.signal),
          observe: (request: NativeWatchRequest, options?: JobObserveOptions) =>
            observeRun(runtime, request, options),
          cancel: (runId: string, options: JobCancelOptions) => cancelRun(runtime, runId, options),
          retry: (runId: string, options: JobRetryOptions) => retryRun(runtime, runId, options),
          result: (runId: string, options: RunResultOptions) =>
            waitForResult(runtime, runId, options),
          ...(runtime.adapter.schedules === undefined
            ? {}
            : { schedules: createScheduleControls(runtime) }),
        }) as JobsControls,
    ),
  ),
);
/** Synchronous factory for a run controls facade.
 * @param runtime - Runtime owning the native provider.
 * @returns A frozen controls facade.
 * @example createJobsControls(runtime);
 */
export function createJobsControls(runtime = requireJobsRuntime()): JobsControls {
  return Effect.runSync(createJobsControlsEffect(runtime));
}
