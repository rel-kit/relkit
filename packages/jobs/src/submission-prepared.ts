import type { JsonValue } from "@relkit/contracts";
import type { JobWireEnvelope, RunHandle } from "@relkit/contracts/jobs";
import { Effect, Result } from "effect";
import { assertJobsCapabilityEffect } from "./capabilities.js";
import type { JobsRuntime } from "./runtime.js";
import { JobSubmissionCancelledError } from "./submission-errors.js";
import { normalizeReceiptEffect, validatedEnvelopeEffect } from "./submission-support.js";
import { submitAbortableEffect } from "./submission-write.js";
import { JobSubmissionPipelineFailure } from "./submission-failure.js";
import { observeJobs } from "./jobs-observability.js";
import type { SubmissionAdmission } from "./submission.types.js";
/** Submits prepared canonical input in Effect.
 * @param runtime - Jobs runtime and native adapter.
 * @param admission - Pinned binding and canonical input.
 * @param signal - Caller cancellation signal.
 * @returns Native run handle or JobSubmissionPipelineFailure.
 * @example Effect.runPromise(submitPreparedSubmissionEffect(runtime, admission));
 */
export const submitPreparedSubmissionEffect = Effect.fn("Jobs.submitPreparedSubmission")(
  (runtime: JobsRuntime, admission: SubmissionAdmission, signal = new AbortController().signal) =>
    observeJobs(
      "submission.submitPrepared",
      Effect.gen(function* () {
        const failure = (cause: unknown) => new JobSubmissionPipelineFailure({ cause });
        yield* Effect.mapError(
          assertJobsCapabilityEffect(runtime.capabilities, "submission"),
          failure,
        );
        if (signal.aborted) return yield* failure(new JobSubmissionCancelledError());
        const envelope = yield* Effect.mapError(validatedEnvelopeEffect(admission), (error) =>
          failure(error.cause),
        );
        const { context, request } = yield* Effect.try({
          try: () => preparedRequest(runtime, admission, signal, envelope),
          catch: failure,
        });
        const receipt = yield* Effect.mapError(
          submitAbortableEffect(runtime.adapter, request, context, signal, admission.metadata),
          (error) => failure(error.cause),
        );
        return yield* Effect.mapError(
          normalizeReceiptEffect(receipt, admission.binding, admission.metadata),
          (error) => failure(error.cause),
        );
      }),
    ),
);
/** Promise compatibility prepared submission.
 * @param runtime - Jobs runtime and native adapter.
 * @param admission - Pinned binding and canonical input.
 * @param signal - Caller cancellation signal.
 * @returns Accepted run handle.
 * @throws Original capability, cancellation, or provider error.
 * @example await submitPreparedSubmission(runtime, admission);
 */
export async function submitPreparedSubmission(
  runtime: JobsRuntime,
  admission: SubmissionAdmission,
  signal = new AbortController().signal,
): Promise<RunHandle> {
  const result = await Effect.runPromise(
    Effect.result(submitPreparedSubmissionEffect(runtime, admission, signal)),
  );
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
function preparedRequest(
  runtime: JobsRuntime,
  admission: SubmissionAdmission,
  signal: AbortSignal,
  envelope: JobWireEnvelope,
) {
  const context = runtime.operationContext({
    signal,
    operationId: admission.metadata.operationId,
    ...(admission.metadata.correlationId === undefined
      ? {}
      : { correlationId: admission.metadata.correlationId }),
    ...(admission.metadata.parentRunId === undefined
      ? {}
      : { parentRunId: admission.metadata.parentRunId }),
    ...(admission.metadata.propagation === undefined
      ? {}
      : { propagation: admission.metadata.propagation }),
    ...(admission.metadata.acceptanceIdentity === undefined
      ? {}
      : { acceptanceIdentity: admission.metadata.acceptanceIdentity }),
    ...(admission.metadata.occurrenceIdentity === undefined
      ? {}
      : { occurrenceIdentity: admission.metadata.occurrenceIdentity }),
    ...(admission.metadata.inputSchemaHash === undefined
      ? {}
      : { inputSchemaHash: admission.metadata.inputSchemaHash }),
    ...(admission.metadata.retryOfRunId === undefined
      ? {}
      : { retryOfRunId: admission.metadata.retryOfRunId }),
  });
  const request = {
    jobId: admission.binding.jobId,
    taskId: admission.binding.taskId,
    taskVersion: admission.binding.taskVersion,
    buildId: admission.binding.buildId,
    execution: admission.task.execution,
    scope: runtime.scope,
    input: admission.input,
    canonicalInput: envelope,
    inputHash: admission.inputHash,
    operationId: admission.metadata.operationId,
    ...(admission.metadata.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: admission.metadata.idempotencyKey }),
    ...(admission.metadata.scheduledFor === undefined
      ? {}
      : { scheduledFor: admission.metadata.scheduledFor }),
    ...(admission.metadata.tags === undefined ? {} : { tags: admission.metadata.tags }),
    ...(admission.metadata.correlationId === undefined
      ? {}
      : { correlationId: admission.metadata.correlationId }),
    ...(admission.metadata.parentRunId === undefined
      ? {}
      : { parentRunId: admission.metadata.parentRunId }),
    ...(admission.metadata.propagation === undefined
      ? {}
      : { propagation: admission.metadata.propagation }),
    ...(admission.metadata.acceptanceIdentity === undefined
      ? {}
      : { acceptanceIdentity: admission.metadata.acceptanceIdentity }),
    ...(admission.metadata.occurrenceIdentity === undefined
      ? {}
      : { occurrenceIdentity: admission.metadata.occurrenceIdentity }),
    ...(admission.metadata.inputSchemaHash === undefined
      ? {}
      : { inputSchemaHash: admission.metadata.inputSchemaHash }),
    ...(admission.metadata.retryOfRunId === undefined
      ? {}
      : { retryOfRunId: admission.metadata.retryOfRunId }),
    ...(admission.binding.policy === undefined
      ? {}
      : { policy: admission.binding.policy as JsonValue }),
  } as const;
  return { request, context };
}
