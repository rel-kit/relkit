import { Effect } from "effect";
import { runJobsSync } from "./compatibility.js";
import { observeJobs, recordJobsWorkload } from "./observability.js";
import { add } from "../normalize-pass-utils.js";
import { schemaEquivalentEffect, schemaEffect } from "../normalize-compat.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "../normalize-types.js";
import { isRecord } from "../normalize-utils.js";
import { validateProviderRequirementsEffect, taskForJobEffect } from "./provider-requirements.js";
import { validateReplayAdvisoriesEffect } from "./replay-diagnostics.js";
import { computeJobBuildIdEffect } from "./build-id.js";
import {
  validateClientEffect,
  validateResourcesEffect,
  validateSchedulesEffect,
} from "./diagnostic-validation.js";

/**
 * Runs task-backed preflight checks in order and then adds replay advisories.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @returns A lazy effect yielding void after appending requirement and replay diagnostics.
 * @remarks Requires no services. Build JSON failures use JsonValueError; validation findings append diagnostics.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { validateJobRequirementsEffect } from "./diagnostics.js";
 * // work contains resolved references and schema hashes from preceding passes.
 * const exit = Effect.runSync(Effect.exit(validateJobRequirementsEffect(work)));
 * ```
 */
export const validateJobRequirementsEffect = Effect.fn("Jobs.validateJobRequirements")(
  function* (work: NormalizationWork) {
    yield* Effect.forEach(
      work.descriptors.filter((entry) => entry.kind === "job"),
      (job) =>
        Effect.gen(function* () {
          const value = isRecord(job.value) ? job.value : {};
          if (!isRecord(value.task)) return;
          const task = yield* taskForJobEffect(work, job);
          if (task === undefined) return;
          yield* validateVersionEffect(work, job, task);
          yield* validateJobSchemasEffect(work, job, task);
          yield* validateClientEffect(work, job, task);
          yield* validateSchedulesEffect(work, job);
          yield* validateResourcesEffect(work, task);
          yield* validateProviderRequirementsEffect(work, job, task);
        }),
      { discard: true },
    );
    yield* validateReplayAdvisoriesEffect(work);
    yield* recordJobsWorkload("validateRequirements", {
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    });
  },
  (effect) => observeJobs("validateRequirements", effect),
);

/**
 * Runs task-backed preflight checks in order and then adds replay advisories.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @returns void after appending requirement and replay diagnostics.
 * @see {@link validateJobRequirementsEffect} for composition and execution examples.
 */
export function validateJobRequirements(work: NormalizationWork): void {
  return runJobsSync(validateJobRequirementsEffect(work));
}

/**
 * Checks declared task versions and any pinned job build identity.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param job - Normalized job binding being projected or checked.
 * @param task - Normalized task descriptor being projected or checked.
 * @returns A lazy effect yielding void after appending version and pinned-build diagnostics.
 * @remarks Requires no services. Invalid versions append diagnostics; malformed build JSON fails with JsonValueError.
 */
const validateVersionEffect = Effect.fn("Jobs.validateVersion")(function* (
  work: NormalizationWork,
  job: NormalizedDescriptor,
  task: NormalizedDescriptor,
) {
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
  const computedBuildId = yield* computeJobBuildIdEffect(job, work);
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
});

/**
 * Checks projected job schemas against the authoritative task contract.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param job - Normalized job binding being projected or checked.
 * @param task - Normalized task descriptor being projected or checked.
 * @returns A lazy effect yielding void after appending incompatible projection diagnostics.
 * @remarks Requires no services. Validation findings append diagnostics; unexpected exceptions remain defects.
 */
const validateJobSchemasEffect = Effect.fn("Jobs.validateJobSchemas")(function* (
  work: NormalizationWork,
  job: NormalizedDescriptor,
  task: NormalizedDescriptor,
) {
  const jobValue = isRecord(job.value) ? job.value : {};
  const taskValue = isRecord(task.value) ? task.value : {};
  if (
    jobValue.input !== undefined &&
    !(yield* schemaEquivalentEffect(jobValue.input, taskValue.input))
  )
    add(
      work,
      job,
      NORMALIZE_CODES.jobProjection,
      "Job input must be the task input view and cannot be overridden.",
    );
  if (
    jobValue.output !== undefined &&
    !(yield* schemaEquivalentEffect(jobValue.output, taskValue.output))
  )
    add(
      work,
      job,
      NORMALIZE_CODES.jobProjection,
      "Job output must be the task output view and cannot be overridden.",
    );
  const canonicalInput = yield* schemaEffect(taskValue.inputWire ?? taskValue.input, "output");
  if (!canonicalInput.ok)
    add(
      work,
      task,
      NORMALIZE_CODES.jobProjection,
      "Task has no faithful canonical input projection.",
    );
});

export { taskForJob, taskForJobEffect } from "./provider-requirements.js";
