import { decodeJobWire, type encodeJobWire } from "./task-wire.js";
import type { JobDescriptorAny } from "./job-types.js";
import type { JobsRuntime, JobsRuntimeBinding } from "./runtime.js";
import type { TaskDescriptorAny } from "./task-types.js";
import { copyTriggerOptions } from "./trigger-validation.js";
import {
  currentCorrelation,
  currentTaskRunId,
  explicitOrDerivedKey,
  hashWire,
  propagationFor,
  scheduledTime,
  boundedKey,
} from "./submission-support.js";
import { stableIdentityTuple } from "./identity.js";
import type { SubmissionAdmission, TaskSubmissionMetadata } from "./submission-types.js";

export async function prepareAdmission(
  runtime: JobsRuntime,
  task: TaskDescriptorAny,
  wire: ReturnType<typeof encodeJobWire>,
  copied: ReturnType<typeof copyTriggerOptions>,
  job?: JobDescriptorAny,
): Promise<SubmissionAdmission> {
  const canonicalInput = decodeJobWire(wire);
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
  const inputHash = await hashWire(wire);
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

function admissionJobFromPolicy(policy: unknown): JobDescriptorAny | undefined {
  if (policy === null || typeof policy !== "object" || Array.isArray(policy)) return undefined;
  const admission = (policy as Record<string, unknown>).admission;
  if (admission === null || typeof admission !== "object" || Array.isArray(admission))
    return undefined;
  return { admission } as JobDescriptorAny;
}

export { boundedKey };
