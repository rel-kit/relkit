import type { JsonValue } from "@relkit/contracts";
import type { RunHandle } from "@relkit/contracts/jobs";
import { assertJobsCapability } from "./capabilities.js";
import type { JobsRuntime } from "./runtime.js";
import { JobSubmissionCancelledError } from "./submission-errors.js";
import { normalizeReceipt, submitAbortable, validatedEnvelope } from "./submission-support.js";
import type { SubmissionAdmission } from "./submission-types.js";

export async function submitPreparedSubmission(
  runtime: JobsRuntime,
  admission: SubmissionAdmission,
  signal = new AbortController().signal,
): Promise<RunHandle> {
  assertJobsCapability(runtime.capabilities, "submission");
  if (signal.aborted) throw new JobSubmissionCancelledError();
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
    canonicalInput: validatedEnvelope(admission),
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
  const receipt = await submitAbortable(
    runtime.adapter,
    request,
    context,
    signal,
    admission.metadata,
  );
  return normalizeReceipt(receipt, admission.binding, admission.metadata);
}
