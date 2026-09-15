import type { JsonValue, TracePropagation } from "@relkit/contracts";
import type { JobWireEnvelope, RunHandle } from "@relkit/contracts/jobs";
import type { JobDescriptorAny } from "./job-types.js";
import { requireJobsRuntime, type JobsRuntime, type JobsRuntimeBinding } from "./runtime.js";
import type { TaskDescriptorAny } from "./task-types.js";
import { assertJobsCapability } from "./capabilities.js";
import { copyTriggerOptions } from "./trigger-validation.js";
import { decodeJobWire, encodeJobWire, validateCanonicalInput, validateTaskInput } from "./task-wire.js";
import {
  currentCorrelation,
  currentTaskRunId,
  explicitOrDerivedKey,
  hashWire,
  normalizeReceipt,
  propagationFor,
  scheduledTime,
  submitAbortable,
  validatedEnvelope,
} from "./submission-support.js";
import { requireOperationId } from "./control-support.js";
import { boundedKey } from "./submission-support.js";
import { stableIdentityTuple } from "./identity.js";
import {
  JobReceiptError,
  JobSubmissionCancelledError,
  JobSubmissionError,
  JobSubmissionUnknownError,
} from "./submission-errors.js";

export {
  JobReceiptError,
  JobSubmissionCancelledError,
  JobSubmissionError,
  JobSubmissionUnknownError,
} from "./submission-errors.js";

export interface TaskSubmissionMetadata {
  readonly operationId: string;
  readonly idempotencyKey?: string;
  readonly scheduledFor?: string;
  readonly tags?: readonly string[];
  readonly correlationId?: string;
  readonly parentRunId?: string;
  readonly propagation?: TracePropagation;
  readonly acceptanceIdentity?: string;
  readonly occurrenceIdentity?: string;
  readonly inputSchemaHash?: string;
  readonly retryOfRunId?: string;
}

export interface CanonicalTaskSubmissionOptions {
  readonly canonicalInput: JobWireEnvelope;
  readonly operationId: string;
  readonly idempotencyKey?: string;
  readonly signal?: AbortSignal;
  readonly scheduledFor?: string;
  readonly occurrenceIdentity?: string;
  readonly acceptanceIdentity?: string;
  readonly retryOfRunId?: string;
  readonly inputHash?: string;
  readonly inputSchemaHash?: string;
  readonly job?: JobDescriptorAny;
}

export interface SubmissionAdmission {
  readonly task: TaskDescriptorAny;
  readonly job?: JobDescriptorAny;
  readonly binding: JobsRuntimeBinding;
  readonly input: JsonValue;
  readonly canonicalInput: ReturnType<typeof decodeJobWire>;
  readonly inputHash: string;
  readonly metadata: TaskSubmissionMetadata;
}

export interface SubmissionPipeline {
  readonly submitTask: (
    task: TaskDescriptorAny,
    input: unknown,
    options?: unknown,
  ) => Promise<RunHandle>;
  readonly submitJob: (
    job: JobDescriptorAny,
    input: unknown,
    options?: unknown,
  ) => Promise<RunHandle>;
}

export function createSubmissionPipeline(runtime: JobsRuntime): SubmissionPipeline {
  return Object.freeze({
    submitTask: (task: TaskDescriptorAny, input: unknown, options?: unknown) =>
      admitAndSubmit(runtime, task, input, options),
    submitJob: (job: JobDescriptorAny, input: unknown, options?: unknown) =>
      admitAndSubmit(runtime, job.task, input, options, job),
  });
}

export function submitTask(
  task: TaskDescriptorAny,
  input: unknown,
  options?: unknown,
  runtime = requireJobsRuntime(),
): Promise<RunHandle> {
  return admitAndSubmit(runtime, task, input, options);
}

export function submitJob(
  job: JobDescriptorAny,
  input: unknown,
  options?: unknown,
  runtime = requireJobsRuntime(),
): Promise<RunHandle> {
  return admitAndSubmit(runtime, job.task, input, options, job);
}

export async function prepareSubmission(
  runtime: JobsRuntime,
  task: TaskDescriptorAny,
  input: unknown,
  options?: unknown,
  job?: JobDescriptorAny,
): Promise<SubmissionAdmission> {
  const copied = copyTriggerOptions(options ?? {});
  const validated = await validateTaskInput(task.input, input);
  const canonicalInput = decodeJobWire(validated.wire);
  const selectedJob = (copied.job as JobDescriptorAny | undefined) ?? job;
  const binding = runtime.resolveBinding(task, selectedJob);
  const operationId = copied.operationId ?? globalThis.crypto.randomUUID();
  const configuredJob = runtime.jobs?.find((candidate) => candidate.ref.id === binding.jobId);
  const admissionJob = selectedJob ?? configuredJob ?? admissionJobFromPolicy(binding.policy);
  const idempotencyKey = explicitOrDerivedKey(admissionJob, copied, canonicalInput);
  const correlationId = copied.correlationId ?? currentCorrelation();
  const propagation = propagationFor(correlationId);
  const parentRunId = currentTaskRunId();
  const scheduledFor = scheduledTime(copied, Date.now());
  const inputHash = await hashWire(validated.wire);
  const acceptanceIdentity = stableIdentityTuple([
    runtime.application,
    runtime.environment,
    runtime.scope,
    binding.jobId,
    binding.taskId,
    binding.taskVersion,
    binding.buildId,
    idempotencyKey ?? operationId,
  ]);
  const metadata: TaskSubmissionMetadata = {
    operationId,
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    ...(scheduledFor === undefined ? {} : { scheduledFor }),
    ...(copied.tags === undefined ? {} : { tags: copied.tags }),
    ...(correlationId === undefined ? {} : { correlationId }),
    ...(parentRunId === undefined ? {} : { parentRunId }),
    ...(propagation === undefined ? {} : { propagation }),
    acceptanceIdentity,
    ...(binding.inputSchemaHash === undefined ? {} : { inputSchemaHash: binding.inputSchemaHash }),
  };
  return Object.freeze({
    task,
    ...(selectedJob === undefined ? {} : { job: selectedJob }),
    binding,
    input: canonicalInput === undefined ? null : canonicalInput,
    canonicalInput,
    inputHash,
    metadata,
  });
}

/** Re-admits a native canonical envelope without applying the public input transform. */
export async function submitCanonicalTask(
  runtime: JobsRuntime,
  task: TaskDescriptorAny,
  options: CanonicalTaskSubmissionOptions,
): Promise<RunHandle> {
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
  const acceptanceIdentity = options.acceptanceIdentity ?? stableIdentityTuple([
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
    ...(options.idempotencyKey === undefined ? {} : { idempotencyKey: boundedKey(options.idempotencyKey) }),
    ...(options.scheduledFor === undefined ? {} : { scheduledFor: options.scheduledFor }),
    ...(options.occurrenceIdentity === undefined ? {} : { occurrenceIdentity: options.occurrenceIdentity }),
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
    input: canonicalValue === undefined ? null : canonicalValue as JsonValue,
    canonicalInput,
    inputHash,
    operationId: options.operationId,
    ...(metadata.idempotencyKey === undefined ? {} : { idempotencyKey: metadata.idempotencyKey }),
    ...(metadata.scheduledFor === undefined ? {} : { scheduledFor: metadata.scheduledFor }),
    ...(metadata.occurrenceIdentity === undefined ? {} : { occurrenceIdentity: metadata.occurrenceIdentity }),
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

async function admitAndSubmit(
  runtime: JobsRuntime,
  task: TaskDescriptorAny,
  input: unknown,
  options: unknown,
  job?: JobDescriptorAny,
): Promise<RunHandle> {
  assertJobsCapability(runtime.capabilities, "submission");
  const admission = await prepareSubmission(runtime, task, input, options, job);
  const copied = copyTriggerOptions(options ?? {});
  const signal = copied.signal ?? new AbortController().signal;
  if (signal.aborted) throw new JobSubmissionCancelledError();
  const context = runtime.operationContext({
    signal,
    operationId: admission.metadata.operationId,
    ...(admission.metadata.correlationId === undefined ? {} : { correlationId: admission.metadata.correlationId }),
    ...(admission.metadata.parentRunId === undefined ? {} : { parentRunId: admission.metadata.parentRunId }),
    ...(admission.metadata.propagation === undefined ? {} : { propagation: admission.metadata.propagation }),
    ...(admission.metadata.acceptanceIdentity === undefined ? {} : { acceptanceIdentity: admission.metadata.acceptanceIdentity }),
    ...(admission.metadata.occurrenceIdentity === undefined ? {} : { occurrenceIdentity: admission.metadata.occurrenceIdentity }),
    ...(admission.metadata.inputSchemaHash === undefined ? {} : { inputSchemaHash: admission.metadata.inputSchemaHash }),
    ...(admission.metadata.retryOfRunId === undefined ? {} : { retryOfRunId: admission.metadata.retryOfRunId }),
  });
  const request = {
    jobId: admission.binding.jobId,
    taskId: admission.binding.taskId,
    taskVersion: admission.binding.taskVersion,
    buildId: admission.binding.buildId,
    execution: task.execution,
    scope: runtime.scope,
    input: admission.input,
    canonicalInput: validatedEnvelope(admission),
    inputHash: admission.inputHash,
    operationId: admission.metadata.operationId,
    ...(admission.metadata.idempotencyKey === undefined ? {} : { idempotencyKey: admission.metadata.idempotencyKey }),
    ...(admission.metadata.scheduledFor === undefined ? {} : { scheduledFor: admission.metadata.scheduledFor }),
    ...(admission.metadata.tags === undefined ? {} : { tags: admission.metadata.tags }),
    ...(admission.metadata.correlationId === undefined ? {} : { correlationId: admission.metadata.correlationId }),
    ...(admission.metadata.parentRunId === undefined ? {} : { parentRunId: admission.metadata.parentRunId }),
    ...(admission.metadata.propagation === undefined ? {} : { propagation: admission.metadata.propagation }),
    ...(admission.metadata.acceptanceIdentity === undefined ? {} : { acceptanceIdentity: admission.metadata.acceptanceIdentity }),
    ...(admission.metadata.occurrenceIdentity === undefined ? {} : { occurrenceIdentity: admission.metadata.occurrenceIdentity }),
    ...(admission.metadata.inputSchemaHash === undefined ? {} : { inputSchemaHash: admission.metadata.inputSchemaHash }),
    ...(admission.metadata.retryOfRunId === undefined ? {} : { retryOfRunId: admission.metadata.retryOfRunId }),
    ...(admission.binding.policy === undefined ? {} : { policy: admission.binding.policy as JsonValue }),
  } as const;
  const receipt = await submitAbortable(runtime.adapter, request, context, signal, admission.metadata);
  return normalizeReceipt(receipt, admission.binding, admission.metadata);
}

function admissionJobFromPolicy(policy: unknown): JobDescriptorAny | undefined {
  if (policy === null || typeof policy !== "object" || Array.isArray(policy)) return undefined;
  const admission = (policy as Record<string, unknown>).admission;
  if (admission === null || typeof admission !== "object" || Array.isArray(admission)) return undefined;
  return { admission } as JobDescriptorAny;
}
