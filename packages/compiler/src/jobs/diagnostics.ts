import { add } from "../normalize-pass-utils.js";
import { schema, schemaEquivalent } from "../normalize-compat.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "../normalize-types.js";
import { isRecord, refId } from "../normalize-utils.js";
import { validateProviderRequirements, taskForJob } from "./provider-requirements.js";
import { validateReplayAdvisories } from "./replay-diagnostics.js";
import { computeJobBuildId } from "./build-id.js";
import { validateClient, validateResources, validateSchedules } from "./diagnostic-validation.js";

/** Runs task-backed preflight checks after names and references are available. */
export function validateJobRequirements(work: NormalizationWork): void {
  for (const job of work.descriptors.filter((entry) => entry.kind === "job")) {
    const value = isRecord(job.value) ? job.value : {};
    if (!isRecord(value.task)) continue;
    const task = taskForJob(work, job);
    if (task === undefined) continue;
    validateVersion(work, job, task);
    validateJobSchemas(work, job, task);
    validateClient(work, job, task);
    validateSchedules(work, job);
    validateResources(work, task);
    validateProviderRequirements(work, job, task);
  }
  validateReplayAdvisories(work);
}

function validateVersion(
  work: NormalizationWork,
  job: NormalizedDescriptor,
  task: NormalizedDescriptor,
): void {
  const jobValue = isRecord(job.value) ? job.value : {};
  const taskValue = isRecord(task.value) ? task.value : {};
  const taskVersion = typeof taskValue.version === "string" ? taskValue.version : undefined;
  const boundTask = isRecord(jobValue.task) ? jobValue.task : {};
  if (taskVersion === undefined || taskVersion.length === 0) {
    add(work, task, NORMALIZE_CODES.jobVersion, "Task version must be a non-empty string.");
  } else if (boundTask.version !== undefined && boundTask.version !== taskVersion) {
    add(
      work,
      job,
      NORMALIZE_CODES.jobVersion,
      `Job "${job.id}" binds task "${task.id}" at version "${String(boundTask.version)}", but the task declares "${taskVersion}".`,
    );
  }
  if (typeof jobValue.buildId === "string" && jobValue.buildId.trim() === "")
    add(work, job, NORMALIZE_CODES.jobVersion, "Job buildId must not be empty.");
  const computedBuildId = computeJobBuildId(job, work);
  if (
    typeof jobValue.buildId === "string" &&
    computedBuildId !== undefined &&
    jobValue.buildId !== computedBuildId
  ) {
    add(
      work,
      job,
      NORMALIZE_CODES.jobVersion,
      `Job "${job.id}" pins buildId "${jobValue.buildId}" but the current task contract resolves to "${computedBuildId}".`,
      "error",
      undefined,
      "Regenerate the jobs manifest or retain the pinned worker build for accepted runs.",
    );
  }
}

function validateJobSchemas(
  work: NormalizationWork,
  job: NormalizedDescriptor,
  task: NormalizedDescriptor,
): void {
  const jobValue = isRecord(job.value) ? job.value : {};
  const taskValue = isRecord(task.value) ? task.value : {};
  if (jobValue.input !== undefined && !schemaEquivalent(jobValue.input, taskValue.input))
    add(
      work,
      job,
      NORMALIZE_CODES.jobProjection,
      "Job input must be the task input view and cannot be overridden.",
    );
  if (jobValue.output !== undefined && !schemaEquivalent(jobValue.output, taskValue.output))
    add(
      work,
      job,
      NORMALIZE_CODES.jobProjection,
      "Job output must be the task output view and cannot be overridden.",
    );
  const canonicalInput = schema(taskValue.inputWire ?? taskValue.input, "output");
  if (!canonicalInput.ok)
    add(
      work,
      task,
      NORMALIZE_CODES.jobProjection,
      "Task has no faithful canonical input projection.",
    );
}

export { taskForJob };
