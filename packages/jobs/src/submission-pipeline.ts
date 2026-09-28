import type { RunHandle } from "@relkit/contracts/jobs";
import { Effect, Result } from "effect";
import { assertJobsCapabilityEffect, JobsCapabilityError } from "./capabilities.js";
import type { JobDescriptorAny } from "./job.types.js";
import { observeJobs } from "./jobs-observability.js";
import { requireJobsRuntime, type JobsRuntime } from "./runtime.js";
import { JobSubmissionPipelineFailure } from "./submission-failure.js";
import { prepareSubmissionEffect } from "./submission-prepare.js";
import { submitPreparedSubmissionEffect } from "./submission-prepared.js";
import type { SubmissionPipeline } from "./submission.types.js";
import type { TaskDescriptorAny } from "./task-types.js";
import { copyTriggerOptionsEffect } from "./trigger-validation.js";
/** Builds a task and job submission facade in Effect.
 * @param runtime - Runtime bound to every facade call.
 * @returns A frozen pipeline with Promise compatibility methods.
 * @example Effect.runSync(createSubmissionPipelineEffect(runtime));
 */
export const createSubmissionPipelineEffect = Effect.fn("Jobs.createSubmissionPipeline")(
  (runtime: JobsRuntime) =>
    observeJobs(
      "submission.createPipeline",
      Effect.sync(
        () =>
          Object.freeze({
            submitTask: (task: TaskDescriptorAny, input: unknown, options?: unknown) =>
              submitTask(task, input, options, runtime),
            submitJob: (job: JobDescriptorAny, input: unknown, options?: unknown) =>
              submitJob(job, input, options, runtime),
          }) as SubmissionPipeline,
      ),
    ),
);
/** Synchronous facade factory for the jobs submission pipeline.
 * @param runtime - Runtime bound to every facade call.
 * @returns A frozen pipeline.
 * @example createSubmissionPipeline(runtime);
 */
export function createSubmissionPipeline(runtime: JobsRuntime): SubmissionPipeline {
  return Effect.runSync(createSubmissionPipelineEffect(runtime));
}
/** Submits an authored task in Effect.
 * @param task - Task to submit.
 * @param input - Input to validate.
 * @param options - Trigger options.
 * @param runtime - Jobs runtime.
 * @returns Native receipt or JobSubmissionPipelineFailure.
 * @example Effect.runPromise(submitTaskEffect(task, "hello", {}, runtime));
 */
export const submitTaskEffect = Effect.fn("Jobs.submitTask")(
  (task: TaskDescriptorAny, input: unknown, options: unknown, runtime: JobsRuntime) =>
    observeJobs("submission.submitTask", admitAndSubmitEffect(runtime, task, input, options)),
);
/** Promise compatibility task submission.
 * @param task - Task to submit.
 * @param input - Input to validate.
 * @param options - Trigger options.
 * @param runtime - Jobs runtime, defaulting to the ambient runtime.
 * @returns Native run handle.
 * @throws The original capability, validation, cancellation, or provider error.
 * @example await submitTask(task, "hello", {}, runtime);
 */
export function submitTask(
  task: TaskDescriptorAny,
  input: unknown,
  options?: unknown,
  runtime = requireJobsRuntime(),
): Promise<RunHandle> {
  return runSubmission(submitTaskEffect(task, input, options, runtime));
}
/** Submits an authored job in Effect.
 * @param job - Job to submit.
 * @param input - Input to validate.
 * @param options - Trigger options.
 * @param runtime - Jobs runtime.
 * @returns Native receipt or JobSubmissionPipelineFailure.
 * @example Effect.runPromise(submitJobEffect(job, "hello", {}, runtime));
 */
export const submitJobEffect = Effect.fn("Jobs.submitJob")(
  (job: JobDescriptorAny, input: unknown, options: unknown, runtime: JobsRuntime) =>
    observeJobs(
      "submission.submitJob",
      admitAndSubmitEffect(runtime, job.task, input, options, job),
    ),
);
/** Promise compatibility job submission.
 * @param job - Job to submit.
 * @param input - Input to validate.
 * @param options - Trigger options.
 * @param runtime - Jobs runtime, defaulting to the ambient runtime.
 * @returns Native run handle.
 * @throws The original capability, validation, cancellation, or provider error.
 * @example await submitJob(job, "hello", {}, runtime);
 */
export function submitJob(
  job: JobDescriptorAny,
  input: unknown,
  options?: unknown,
  runtime = requireJobsRuntime(),
): Promise<RunHandle> {
  return runSubmission(submitJobEffect(job, input, options, runtime));
}
/** Performs capability check, validation, and native acceptance in order. */
const admitAndSubmitEffect = Effect.fn("Jobs.admitAndSubmit")(function* (
  runtime: JobsRuntime,
  task: TaskDescriptorAny,
  input: unknown,
  options: unknown,
  job?: JobDescriptorAny,
) {
  yield* Effect.mapError(
    assertJobsCapabilityEffect(runtime.capabilities, "submission"),
    (error) =>
      new JobSubmissionPipelineFailure({
        cause: new JobsCapabilityError(error.capability, error.reason),
      }),
  );
  const admission = yield* prepareSubmissionEffect(runtime, task, input, options, job);
  const copied = yield* Effect.mapError(
    copyTriggerOptionsEffect(options ?? {}),
    (error) => new JobSubmissionPipelineFailure({ cause: new TypeError(error.reason) }),
  );
  const signal = copied.signal ?? new AbortController().signal;
  return yield* submitPreparedSubmissionEffect(runtime, admission, signal);
});
/** Preserves original Promise failures for compatibility callers. */
async function runSubmission(
  effect: Effect.Effect<RunHandle, JobSubmissionPipelineFailure>,
): Promise<RunHandle> {
  const result = await Effect.runPromise(Effect.result(effect));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
