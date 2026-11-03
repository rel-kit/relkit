import type { encodeJobWire } from "./task-wire.js";
import { Effect, Result } from "effect";
import type { JobDescriptorAny } from "./job.types.js";
import { observeJobs } from "./jobs-observability.js";
import type { JobsRuntime } from "./runtime.js";
import { JobSubmissionPipelineFailure } from "./submission-failure.js";
import { prepareAdmissionEffect } from "./submission-admission.js";
import type { SubmissionAdmission } from "./submission.types.js";
import type { TaskDescriptorAny } from "./task-types.js";
import { validateTaskInputEffect } from "./task-wire.js";
import { copyTriggerOptionsEffect } from "./trigger-validation.js";
/** Validates authored input and builds a durable admission in Effect.
 * @param runtime - Jobs runtime used for binding.
 * @param task - Authored task.
 * @param input - Input to validate.
 * @param options - Trigger options.
 * @param job - Optional selected job.
 * @returns Admission or JobSubmissionPipelineFailure.
 * @example Effect.runPromise(prepareSubmissionEffect(runtime, task, "hello"));
 */
export const prepareSubmissionEffect = Effect.fn("Jobs.prepareSubmission")(
  function* (
    runtime: JobsRuntime,
    task: TaskDescriptorAny,
    input: unknown,
    options?: unknown,
    job?: JobDescriptorAny,
  ) {
    const copied = yield* Effect.mapError(
      copyTriggerOptionsEffect(options ?? {}),
      (error) => new JobSubmissionPipelineFailure({ cause: new TypeError(error.reason) }),
    );
    const validated = yield* Effect.mapError(
      validateTaskInputEffect(task.input, input),
      (error) => new JobSubmissionPipelineFailure({ cause: error.cause }),
    );
    return yield* prepareAdmissionEffect(runtime, task, validated.wire, copied, job);
  },
  (effect) => observeJobs("submission.prepare", effect),
);
/** Promise compatibility adapter for authored input admission.
 * @param runtime - Jobs runtime.
 * @param task - Authored task.
 * @param input - Input to validate.
 * @param options - Trigger options.
 * @param job - Optional selected job.
 * @returns Prepared admission.
 * @throws The original validation or preparation error.
 * @example await prepareSubmission(runtime, task, "hello");
 */
export async function prepareSubmission(
  runtime: JobsRuntime,
  task: TaskDescriptorAny,
  input: unknown,
  options?: unknown,
  job?: JobDescriptorAny,
): Promise<SubmissionAdmission> {
  const result = await Effect.runPromise(
    Effect.result(prepareSubmissionEffect(runtime, task, input, options, job)),
  );
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
/** Builds an admission from already canonical input in Effect.
 * @param runtime - Jobs runtime.
 * @param task - Authored task.
 * @param canonicalInput - Validated wire envelope.
 * @param options - Trigger options.
 * @param job - Optional selected job.
 * @returns Prepared admission or JobSubmissionPipelineFailure.
 * @example Effect.runPromise(prepareCanonicalSubmissionEffect(runtime, task, wire));
 */
export const prepareCanonicalSubmissionEffect = Effect.fn("Jobs.prepareCanonicalSubmission")(
  function* (
    runtime: JobsRuntime,
    task: TaskDescriptorAny,
    canonicalInput: ReturnType<typeof encodeJobWire>,
    options?: unknown,
    job?: JobDescriptorAny,
  ) {
    const copied = yield* Effect.mapError(
      copyTriggerOptionsEffect(options ?? {}),
      (error) => new JobSubmissionPipelineFailure({ cause: new TypeError(error.reason) }),
    );
    return yield* prepareAdmissionEffect(runtime, task, canonicalInput, copied, job);
  },
  (effect) => observeJobs("submission.prepareCanonical", effect),
);
/** Promise compatibility adapter for canonical admission.
 * @param runtime - Jobs runtime.
 * @param task - Authored task.
 * @param canonicalInput - Validated wire envelope.
 * @param options - Trigger options.
 * @param job - Optional selected job.
 * @returns Prepared admission.
 * @throws The original trigger or preparation error.
 * @example await prepareCanonicalSubmission(runtime, task, wire);
 */
export async function prepareCanonicalSubmission(
  runtime: JobsRuntime,
  task: TaskDescriptorAny,
  canonicalInput: ReturnType<typeof encodeJobWire>,
  options?: unknown,
  job?: JobDescriptorAny,
): Promise<SubmissionAdmission> {
  const result = await Effect.runPromise(
    Effect.result(prepareCanonicalSubmissionEffect(runtime, task, canonicalInput, options, job)),
  );
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
