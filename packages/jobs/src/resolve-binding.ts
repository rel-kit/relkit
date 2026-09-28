import { isRef } from "@relkit/contracts";
import { Effect, Result, Schema } from "effect";
import type { JobRefAny, TaskRefAny } from "@relkit/contracts/jobs";
import type { JobDescriptorAny } from "./job.types.js";
import { isJobName } from "./job-name.js";
import { JobBindingResolutionError } from "./resolve-binding-error.js";
import type {
  BindingSource,
  JobBindingErrorCode,
  ResolveBindingOptions,
  ResolvedTaskBinding,
} from "./resolve-binding.types.js";
import { selectProfile, taskIdOf } from "./resolve-binding-support.js";
import { observeJobs } from "./jobs-observability.js";
export type {
  BindingSource,
  JobBindingErrorCode,
  ResolveBindingOptions,
  ResolvedTaskBinding,
} from "./resolve-binding.types.js";
export { JobBindingResolutionError } from "./resolve-binding-error.js";
/** A typed task-to-job binding resolution failure.
 * @example if (error instanceof JobBindingFailure) console.log(error.message);
 */
export class JobBindingFailure extends Schema.TaggedError<JobBindingFailure>()(
  "Jobs.BindingFailure",
  { code: Schema.String, reason: Schema.String },
) {}
/** Resolves an explicit, default, or private implicit job in Effect.
 * @param options - Task, candidate jobs, selector, and profiles.
 * @returns A resolved binding or JobBindingFailure.
 * @example Effect.runSync(resolveTaskBindingEffect(options));
 */
export const resolveTaskBindingEffect = Effect.fn("Jobs.resolveTaskBinding")(
  (options: ResolveBindingOptions) =>
    observeJobs(
      "binding.resolve",
      Effect.try({
        try: () => resolveTaskBindingValue(options),
        catch: (error) => {
          if (error instanceof JobBindingResolutionError)
            return new JobBindingFailure({ code: error.code, reason: error.message });
          throw error;
        },
      }),
    ),
);
/** Synchronous compatibility resolver for one task.
 * @param options - Task, candidate jobs, selector, and profiles.
 * @returns A resolved binding.
 * @throws JobBindingResolutionError on ambiguity or invalid selector.
 * @example resolveTaskBinding(options);
 */
export function resolveTaskBinding(options: ResolveBindingOptions): ResolvedTaskBinding {
  const result = Effect.runSync(Effect.result(resolveTaskBindingEffect(options)));
  if (Result.isFailure(result))
    throw new JobBindingResolutionError(
      result.failure.code as JobBindingErrorCode,
      result.failure.reason,
    );
  return result.success;
}
function resolveTaskBindingValue(options: ResolveBindingOptions): ResolvedTaskBinding {
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
/** Compatibility alias for task-to-job binding resolution.
 * @param options - Task and candidate jobs to resolve.
 * @returns The resolved task binding.
 * @throws JobBindingResolutionError for invalid or ambiguous bindings.
 * @example resolveBinding({ task, implicitName: "send" });
 */
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
