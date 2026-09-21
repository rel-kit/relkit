import type { RunHandle } from "@relkit/contracts/jobs";
import type { JobDescriptorAny } from "./job-types.js";
import { assertJobsCapability } from "./capabilities.js";
import { requireJobsRuntime, type JobsRuntime } from "./runtime.js";
import type { TaskDescriptorAny } from "./task-types.js";
import { copyTriggerOptions } from "./trigger-validation.js";
import { validateTaskInput, type encodeJobWire } from "./task-wire.js";
import { prepareAdmission } from "./submission-admission.js";
import { submitPreparedSubmission } from "./submission-prepared.js";

export type {
  CanonicalTaskSubmissionOptions,
  SubmissionAdmission,
  SubmissionPipeline,
  TaskSubmissionMetadata,
} from "./submission-types.js";
import type { SubmissionAdmission, SubmissionPipeline } from "./submission-types.js";

export { submitCanonicalTask } from "./submission-canonical.js";
export { submitPreparedSubmission } from "./submission-prepared.js";
export {
  JobReceiptError,
  JobSubmissionCancelledError,
  JobSubmissionError,
  JobSubmissionUnknownError,
} from "./submission-errors.js";

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
  return prepareAdmission(runtime, task, validated.wire, copied, job);
}

export async function prepareCanonicalSubmission(
  runtime: JobsRuntime,
  task: TaskDescriptorAny,
  canonicalInput: ReturnType<typeof encodeJobWire>,
  options?: unknown,
  job?: JobDescriptorAny,
): Promise<SubmissionAdmission> {
  return prepareAdmission(runtime, task, canonicalInput, copyTriggerOptions(options ?? {}), job);
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
  return submitPreparedSubmission(runtime, admission, signal);
}
