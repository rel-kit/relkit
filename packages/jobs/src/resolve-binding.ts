import { isRef } from "@relkit/contracts";
import type { JobRefAny, TaskRefAny } from "@relkit/contracts/jobs";
import type { JobDescriptorAny } from "./job-types.js";
import { isJobName } from "./job-name.js";

export type BindingSource = "explicit" | "default" | "implicit";

export interface ResolveBindingOptions {
  readonly task: TaskRefAny;
  readonly jobs?: readonly JobDescriptorAny[];
  readonly selector?: JobDescriptorAny | JobRefAny;
  readonly implicitName?: string;
  readonly profiles?: readonly string[] | Readonly<Record<string, unknown>>;
  readonly defaultProfile?: string;
}

export interface ResolvedTaskBinding {
  readonly taskId: string;
  readonly taskVersion?: string;
  readonly jobId: string;
  readonly name: string;
  readonly service?: string;
  readonly profile: string;
  readonly source: BindingSource;
  readonly implicit: boolean;
  readonly default: boolean;
  readonly private: boolean;
  readonly job?: JobDescriptorAny;
}

export type JobBindingErrorCode =
  | "MISSING_IMPLICIT_NAME"
  | "INVALID_IMPLICIT_NAME"
  | "TASK_SELECTOR_MISMATCH"
  | "UNKNOWN_JOB_SELECTOR"
  | "AMBIGUOUS_JOB"
  | "DUPLICATE_JOB_ID"
  | "MULTIPLE_DEFAULT_JOBS"
  | "MISSING_JOB_PROFILE"
  | "AMBIGUOUS_JOB_PROFILE"
  | "UNKNOWN_JOB_PROFILE";

export class JobBindingResolutionError extends TypeError {
  readonly code: JobBindingErrorCode;

  constructor(code: JobBindingErrorCode, message: string) {
    super(message);
    this.name = "JobBindingResolutionError";
    this.code = code;
  }
}

/** Selects the exact explicit, default, or private implicit job for one task. */
export function resolveTaskBinding(options: ResolveBindingOptions): ResolvedTaskBinding {
  const taskId = taskIdOf(options.task);
  const allJobs = [...(options.jobs ?? [])];
  validateSelectorTask(options.selector, taskId, allJobs);
  const jobs = allJobs.filter((job) => taskIdOf(job.task) === taskId);
  const byId = new Set<string>();
  for (const job of jobs) {
    if (byId.has(job.id)) throw new JobBindingResolutionError("DUPLICATE_JOB_ID", `Duplicate job ID "${job.id}".`);
    byId.add(job.id);
  }
  const selected = selectJob(jobs, options.selector);
  if (selected === undefined && jobs.length === 0) {
    const name = options.implicitName;
    if (name === undefined)
      throw new JobBindingResolutionError("MISSING_IMPLICIT_NAME", `Task "${taskId}" requires an explicit job name.`);
    if (!isJobName(name))
      throw new JobBindingResolutionError("INVALID_IMPLICIT_NAME", `Task "${taskId}" has invalid implicit job name "${name}".`);
    return makeBinding(options, taskId, name, "implicit", true, true, taskId);
  }
  if (selected === undefined) {
    const defaults = jobs.filter((job) => job.default === true);
    if (defaults.length > 1)
      throw new JobBindingResolutionError("MULTIPLE_DEFAULT_JOBS", `Task "${taskId}" has multiple default jobs.`);
    if (defaults.length === 0 && jobs.length > 1)
      throw new JobBindingResolutionError("AMBIGUOUS_JOB", `Task "${taskId}" has multiple jobs and no default.`);
    return makeBinding(options, taskId, (defaults[0] ?? jobs[0])!, "default", false, defaults.length === 1);
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
    throw new JobBindingResolutionError("UNKNOWN_JOB_SELECTOR", `Job selector "${selectedId}" does not belong to the task.`);
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
      throw new JobBindingResolutionError("TASK_SELECTOR_MISMATCH", `Job selector "${selector.id}" targets another task.`);
    return;
  }
  const selectedTaskId = taskIdOf(selector.task);
  if (selectedTaskId !== taskId)
    throw new JobBindingResolutionError("TASK_SELECTOR_MISMATCH", `Job selector targets task "${selectedTaskId}", expected "${taskId}".`);
  const selectedId = selector.ref.id;
  if (jobs.some((job) => job.id === selectedId && taskIdOf(job.task) !== taskId))
    throw new JobBindingResolutionError("TASK_SELECTOR_MISMATCH", `Job selector "${selectedId}" targets another task.`);
}

function selectorId(selector: JobDescriptorAny | JobRefAny): string {
  return isRef(selector, "job") ? selector.id : selector.ref.id;
}

function selectProfile(
  requested: string | undefined,
  profiles: ResolveBindingOptions["profiles"],
  jobId: string,
): string {
  const available = profiles === undefined ? [] : Array.isArray(profiles) ? [...profiles] : Object.keys(profiles);
  const selected = requested ?? (available.length === 1 ? available[0] : available.includes("default") ? "default" : undefined);
  if (selected === undefined) {
    if (profiles === undefined) return "default";
    throw new JobBindingResolutionError(available.length === 0 ? "MISSING_JOB_PROFILE" : "AMBIGUOUS_JOB_PROFILE", `Job "${jobId}" requires a jobs provider profile.`);
  }
  if (available.length > 0 && !available.includes(selected))
    throw new JobBindingResolutionError("UNKNOWN_JOB_PROFILE", `Job "${jobId}" selected unknown profile "${selected}".`);
  return selected;
}

function taskIdOf(value: TaskRefAny | undefined): string {
  return value?.ref?.kind === "task" ? value.ref.id : "";
}
