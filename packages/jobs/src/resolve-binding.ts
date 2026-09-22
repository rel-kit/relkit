import { isRef } from "@relkit/contracts";
import type { JobRefAny, TaskRefAny } from "@relkit/contracts/jobs";
import type { JobDescriptorAny } from "./job-types.js";
import { isJobName } from "./job-name.js";
import {
  JobBindingResolutionError,
  type BindingSource,
  type JobBindingErrorCode,
  type ResolveBindingOptions,
  type ResolvedTaskBinding,
} from "./resolve-binding-types.js";
import { selectProfile, taskIdOf } from "./resolve-binding-support.js";

export type {
  BindingSource,
  JobBindingErrorCode,
  ResolveBindingOptions,
  ResolvedTaskBinding,
} from "./resolve-binding-types.js";
export { JobBindingResolutionError } from "./resolve-binding-types.js";

/** Selects the exact explicit, default, or private implicit job for one task. */
export function resolveTaskBinding(options: ResolveBindingOptions): ResolvedTaskBinding {
  const taskId = taskIdOf(options.task);
  const allJobs = [...(options.jobs ?? [])];
  validateSelectorTask(options.selector, taskId, allJobs);
  const jobs = allJobs.filter((job) => taskIdOf(job.task) === taskId);
  const byId = new Set<string>();
  for (const job of jobs) {
    if (byId.has(job.id))
      throw new JobBindingResolutionError("DUPLICATE_JOB_ID", `Duplicate job ID "${job.id}".`);
    byId.add(job.id);
  }
  const selected = selectJob(jobs, options.selector);
  if (selected === undefined && jobs.length === 0) {
    const name = options.implicitName;
    if (name === undefined)
      throw new JobBindingResolutionError(
        "MISSING_IMPLICIT_NAME",
        `Task "${taskId}" requires an explicit job name.`,
      );
    if (!isJobName(name))
      throw new JobBindingResolutionError(
        "INVALID_IMPLICIT_NAME",
        `Task "${taskId}" has invalid implicit job name "${name}".`,
      );
    return makeBinding(options, taskId, name, "implicit", true, true, taskId);
  }
  if (selected === undefined) {
    const defaults = jobs.filter((job) => job.default === true);
    if (defaults.length > 1)
      throw new JobBindingResolutionError(
        "MULTIPLE_DEFAULT_JOBS",
        `Task "${taskId}" has multiple default jobs.`,
      );
    if (defaults.length === 0 && jobs.length > 1)
      throw new JobBindingResolutionError(
        "AMBIGUOUS_JOB",
        `Task "${taskId}" has multiple jobs and no default.`,
      );
    return makeBinding(
      options,
      taskId,
      (defaults[0] ?? jobs[0])!,
      "default",
      false,
      defaults.length === 1,
    );
  }
  return makeBinding(options, taskId, selected, "explicit", false, selected.default === true);
}

export const resolveBinding = resolveTaskBinding;

function makeBinding(
  options: ResolveBindingOptions,
  taskId: string,
  jobOrName: JobDescriptorAny | string,
  source: BindingSource,
  implicit: boolean,
  isDefault: boolean,
  jobIdOverride?: string,
): ResolvedTaskBinding {
  const job = typeof jobOrName === "string" ? undefined : jobOrName;
  const name = typeof jobOrName === "string" ? jobOrName : jobOrName.name;
  const jobId = jobIdOverride ?? (typeof jobOrName === "string" ? jobOrName : jobOrName.id);
  const requested = job?.service ?? job?.profile ?? options.defaultProfile;
  const profile = selectProfile(requested, options.profiles, jobId);
  return {
    taskId,
    ...(typeof job?.task.version === "string" ? { taskVersion: job.task.version } : {}),
    jobId,
    name,
    profile,
    ...(job?.service === undefined ? {} : { service: job.service }),
    source,
    implicit,
    default: isDefault,
    private: implicit || job?.client === undefined,
    ...(job === undefined ? {} : { job }),
  };
}

function selectJob(
  jobs: readonly JobDescriptorAny[],
  selector: JobDescriptorAny | JobRefAny | undefined,
): JobDescriptorAny | undefined {
  if (selector === undefined) return undefined;
  const selectedId = selectorId(selector);
  const selected = jobs.find((job) => job.id === selectedId);
  if (selected === undefined)
    throw new JobBindingResolutionError(
      "UNKNOWN_JOB_SELECTOR",
      `Job selector "${selectedId}" does not belong to the task.`,
    );
  return selected;
}

function validateSelectorTask(
  selector: JobDescriptorAny | JobRefAny | undefined,
  taskId: string,
  jobs: readonly JobDescriptorAny[],
): void {
  if (selector === undefined) return;
  if (isRef(selector, "job")) {
    const selected = jobs.find((job) => job.id === selector.id);
    if (selected !== undefined && taskIdOf(selected.task) !== taskId)
      throw new JobBindingResolutionError(
        "TASK_SELECTOR_MISMATCH",
        `Job selector "${selector.id}" targets another task.`,
      );
    return;
  }
  const selectedTaskId = taskIdOf(selector.task);
  if (selectedTaskId !== taskId)
    throw new JobBindingResolutionError(
      "TASK_SELECTOR_MISMATCH",
      `Job selector targets task "${selectedTaskId}", expected "${taskId}".`,
    );
  const selectedId = selector.ref.id;
  if (jobs.some((job) => job.id === selectedId && taskIdOf(job.task) !== taskId))
    throw new JobBindingResolutionError(
      "TASK_SELECTOR_MISMATCH",
      `Job selector "${selectedId}" targets another task.`,
    );
}

function selectorId(selector: JobDescriptorAny | JobRefAny): string {
  return isRef(selector, "job") ? selector.id : selector.ref.id;
}
