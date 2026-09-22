import type { JsonValue } from "@relkit/contracts";
import type { JobDescriptorAny } from "./job-types.js";
import { assertJobsCapability } from "./capabilities.js";
import { decodeJobWire, encodeJobWire, validateCanonicalInput } from "./task-wire.js";
import type { JobsRuntime } from "./runtime.js";
import type { TaskDescriptorAny } from "./task-types.js";
import { boundedKey, hashWire, normalizeReceipt, submitAbortable } from "./submission-support.js";
import { stableIdentityTuple } from "./identity.js";
import { requireOperationId } from "./control-support.js";
import { JobSubmissionCancelledError, JobSubmissionError } from "./submission-errors.js";
import type { CanonicalTaskSubmissionOptions, TaskSubmissionMetadata } from "./submission-types.js";

export async function submitCanonicalTask(
  runtime: JobsRuntime,
  task: TaskDescriptorAny,
  options: CanonicalTaskSubmissionOptions,
): Promise<import("@relkit/contracts/jobs").RunHandle> {
  assertJobsCapability(runtime.capabilities, "submission");
  requireOperationId(options.operationId);
  const selectedJob = options.job;
  const binding = runtime.resolveBinding(task, selectedJob);
  const decoded = decodeJobWire(options.canonicalInput);
  const canonicalValue = await validateCanonicalInput(task.input, decoded, task.inputWire);
  const canonicalInput = encodeJobWire(canonicalValue);
  const inputHash = await hashWire(canonicalInput);
  if (options.inputHash !== undefined && options.inputHash !== inputHash) {
    throw new JobSubmissionError("Canonical task input hash does not match the pinned input");
  }
  const inputSchemaHash = options.inputSchemaHash ?? binding.inputSchemaHash;
  if (
    options.inputSchemaHash !== undefined &&
    binding.inputSchemaHash !== undefined &&
    options.inputSchemaHash !== binding.inputSchemaHash
  ) {
    throw new JobSubmissionError("Canonical task input schema is not pinned to the selected build");
  }
  const signal = options.signal ?? new AbortController().signal;
  if (signal.aborted) throw new JobSubmissionCancelledError();
  const acceptanceIdentity =
    options.acceptanceIdentity ??
    stableIdentityTuple([
      runtime.application,
      runtime.environment,
      runtime.scope,
      binding.jobId,
      binding.taskId,
      binding.taskVersion,
      binding.buildId,
      options.idempotencyKey ?? options.operationId,
    ]);
  const metadata: TaskSubmissionMetadata = {
    operationId: options.operationId,
    ...(options.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: boundedKey(options.idempotencyKey) }),
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
  const receipt = await submitAbortable(
    runtime.adapter,
    request,
    runtime.operationContext({ signal, operationId: options.operationId }),
    signal,
    metadata,
  );
  return normalizeReceipt(receipt, binding, metadata);
}
