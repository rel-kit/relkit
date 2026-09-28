import type { JsonValue } from "@relkit/contracts";
import { Effect, Result } from "effect";
import type { JobDescriptorAny } from "./job.types.js";
import { assertJobsCapabilityEffect, JobsCapabilityError } from "./capabilities.js";
import {
  decodeJobWireEffect,
  encodeJobWireEffect,
  validateCanonicalInputEffect,
} from "./task-wire.js";
import type { JobsRuntime } from "./runtime.js";
import type { TaskDescriptorAny } from "./task-types.js";
import { boundedKeyEffect, hashWireEffect, normalizeReceiptEffect } from "./submission-support.js";
import { stableIdentityTupleEffect } from "./identity.js";
import { requireOperationIdEffect } from "./control-support.js";
import { submitAbortableEffect } from "./submission-write.js";
import { JobSubmissionCancelledError, JobSubmissionError } from "./submission-errors.js";
import { JobSubmissionPipelineFailure } from "./submission-failure.js";
import { observeJobs } from "./jobs-observability.js";
import type { CanonicalTaskSubmissionOptions, TaskSubmissionMetadata } from "./submission.types.js";
/** Submits an already canonical task input in Effect.
 * @param runtime - Jobs runtime.
 * @param task - Task to submit.
 * @param options - Canonical input and pinned identities.
 * @returns A run handle or JobSubmissionPipelineFailure.
 * @example Effect.runPromise(submitCanonicalTaskEffect(runtime, task, options));
 */
export const submitCanonicalTaskEffect = Effect.fn("Jobs.submitCanonicalTask")(
  (runtime: JobsRuntime, task: TaskDescriptorAny, options: CanonicalTaskSubmissionOptions) =>
    observeJobs("submission.submitCanonical", submitCanonicalValue(runtime, task, options)),
);
/** Promise compatibility adapter for canonical submission.
 * @param runtime - Jobs runtime.
 * @param task - Task to submit.
 * @param options - Canonical input and pinned identities.
 * @returns A run handle.
 * @throws The original validation, cancellation, or provider error.
 * @example await submitCanonicalTask(runtime, task, options);
 */
export async function submitCanonicalTask(
  runtime: JobsRuntime,
  task: TaskDescriptorAny,
  options: CanonicalTaskSubmissionOptions,
): Promise<import("@relkit/contracts/jobs").RunHandle> {
  const result = await Effect.runPromise(
    Effect.result(submitCanonicalTaskEffect(runtime, task, options)),
  );
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
const submitCanonicalValue = Effect.fn("Jobs.submitCanonicalValue")(function* (
  runtime: JobsRuntime,
  task: TaskDescriptorAny,
  options: CanonicalTaskSubmissionOptions,
) {
  const failure = (cause: unknown) => new JobSubmissionPipelineFailure({ cause });
  yield* Effect.mapError(assertJobsCapabilityEffect(runtime.capabilities, "submission"), (error) =>
    failure(new JobsCapabilityError(error.capability, error.reason)),
  );
  yield* Effect.mapError(requireOperationIdEffect(options.operationId), (error) =>
    failure(error.cause),
  );
  const selectedJob = options.job;
  const binding = yield* Effect.try({
    try: () => runtime.resolveBinding(task, selectedJob),
    catch: failure,
  });
  const decoded = yield* Effect.mapError(decodeJobWireEffect(options.canonicalInput), (error) =>
    failure(error.cause),
  );
  const canonicalValue = yield* Effect.mapError(
    validateCanonicalInputEffect(task.input, decoded, task.inputWire),
    (error) => failure(error.cause),
  );
  const canonicalInput = yield* Effect.mapError(encodeJobWireEffect(canonicalValue), (error) =>
    failure(error.cause),
  );
  const inputHash = yield* Effect.mapError(hashWireEffect(canonicalInput), (error) =>
    failure(error.cause),
  );
  if (options.inputHash !== undefined && options.inputHash !== inputHash) {
    return yield* failure(
      new JobSubmissionError("Canonical task input hash does not match the pinned input"),
    );
  }
  const inputSchemaHash = options.inputSchemaHash ?? binding.inputSchemaHash;
  if (
    options.inputSchemaHash !== undefined &&
    binding.inputSchemaHash !== undefined &&
    options.inputSchemaHash !== binding.inputSchemaHash
  ) {
    return yield* failure(
      new JobSubmissionError("Canonical task input schema is not pinned to the selected build"),
    );
  }
  const signal = options.signal ?? new AbortController().signal;
  if (signal.aborted) return yield* failure(new JobSubmissionCancelledError());
  const acceptanceIdentity =
    options.acceptanceIdentity ??
    (yield* Effect.mapError(
      stableIdentityTupleEffect([
        runtime.application,
        runtime.environment,
        runtime.scope,
        binding.jobId,
        binding.taskId,
        binding.taskVersion,
        binding.buildId,
        options.idempotencyKey ?? options.operationId,
      ]),
      (error) => failure(error.cause),
    ));
  const idempotencyKey =
    options.idempotencyKey === undefined
      ? undefined
      : yield* Effect.mapError(boundedKeyEffect(options.idempotencyKey), (error) =>
          failure(error.cause),
        );
  const metadata: TaskSubmissionMetadata = {
    operationId: options.operationId,
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    ...(options.scheduledFor === undefined ? {} : { scheduledFor: options.scheduledFor }),
    ...(options.occurrenceIdentity === undefined
      ? {}
      : { occurrenceIdentity: options.occurrenceIdentity }),
    acceptanceIdentity,
    ...(inputSchemaHash === undefined ? {} : { inputSchemaHash }),
    ...(options.retryOfRunId === undefined ? {} : { retryOfRunId: options.retryOfRunId }),
  };
  const request = {
    jobId: binding.jobId,
    taskId: binding.taskId,
    taskVersion: binding.taskVersion,
    buildId: binding.buildId,
    execution: task.execution,
    scope: runtime.scope,
    input: canonicalValue === undefined ? null : (canonicalValue as JsonValue),
    canonicalInput,
    inputHash,
    operationId: options.operationId,
    ...(metadata.idempotencyKey === undefined ? {} : { idempotencyKey: metadata.idempotencyKey }),
    ...(metadata.scheduledFor === undefined ? {} : { scheduledFor: metadata.scheduledFor }),
    ...(metadata.occurrenceIdentity === undefined
      ? {}
      : { occurrenceIdentity: metadata.occurrenceIdentity }),
    acceptanceIdentity,
    ...(metadata.retryOfRunId === undefined ? {} : { retryOfRunId: metadata.retryOfRunId }),
    ...(inputSchemaHash === undefined ? {} : { inputSchemaHash }),
    ...(binding.policy === undefined ? {} : { policy: binding.policy as JsonValue }),
  } as const;
  const context = yield* Effect.try({
    try: () => runtime.operationContext({ signal, operationId: options.operationId }),
    catch: failure,
  });
  const receipt = yield* Effect.mapError(
    submitAbortableEffect(runtime.adapter, request, context, signal, metadata),
    (error) => failure(error.cause),
  );
  return yield* Effect.mapError(normalizeReceiptEffect(receipt, binding, metadata), (error) =>
    failure(error.cause),
  );
});
