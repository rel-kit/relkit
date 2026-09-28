import type { TaskRefAny } from "@relkit/contracts/jobs";
import { Effect, Result, Schema } from "effect";
import type { JobBindingErrorCode, ResolveBindingOptions } from "./resolve-binding.types.js";
import { JobBindingResolutionError } from "./resolve-binding-error.js";
import { observeJobs } from "./jobs-observability.js";
/** A provider profile selection failure with a stable resolution code.
 * @example new JobBindingSupportFailure({ code: "UNKNOWN_JOB_PROFILE", reason: "Unknown profile" });
 */
export class JobBindingSupportFailure extends Schema.TaggedError<JobBindingSupportFailure>()(
  "Jobs.BindingSupportFailure",
  { code: Schema.String, reason: Schema.String },
) {}
/** Selects a provider profile in Effect.
 * @param requested - Authored profile override.
 * @param profiles - Available provider profiles.
 * @param jobId - Job identity for diagnostics.
 * @returns Selected profile or JobBindingSupportFailure.
 * @example Effect.runSync(selectProfileEffect(undefined, ["default"], "send"));
 */
export const selectProfileEffect = Effect.fn("Jobs.selectBindingProfile")(
  (requested: string | undefined, profiles: ResolveBindingOptions["profiles"], jobId: string) =>
    observeJobs(
      "binding.selectProfile",
      Effect.try({
        try: () => selectProfileValue(requested, profiles, jobId),
        catch: (error) => {
          if (error instanceof JobBindingResolutionError)
            return new JobBindingSupportFailure({ code: error.code, reason: error.message });
          throw error;
        },
      }),
    ),
);
/** Synchronous provider profile selector.
 * @param requested - Authored profile override.
 * @param profiles - Available provider profiles.
 * @param jobId - Job identity for diagnostics.
 * @returns Selected profile.
 * @throws JobBindingResolutionError for missing or unknown profiles.
 * @example selectProfile(undefined, ["default"], "send");
 */
export function selectProfile(
  requested: string | undefined,
  profiles: ResolveBindingOptions["profiles"],
  jobId: string,
): string {
  const result = Effect.runSync(Effect.result(selectProfileEffect(requested, profiles, jobId)));
  if (Result.isFailure(result))
    throw new JobBindingResolutionError(
      result.failure.code as JobBindingErrorCode,
      result.failure.reason,
    );
  return result.success;
}
/** Reads a task reference id in Effect.
 * @param value - Optional task reference.
 * @returns Task id or empty text; no expected failure.
 * @example Effect.runSync(taskIdOfEffect(taskRef));
 */
export const taskIdOfEffect = Effect.fn("Jobs.taskIdOfBinding")((value: TaskRefAny | undefined) =>
  observeJobs(
    "binding.taskId",
    Effect.sync(() => taskIdOfValue(value)),
  ),
);
/** Synchronous task reference id reader.
 * @param value - Optional task reference.
 * @returns Task id or empty text.
 * @example taskIdOf(taskRef);
 */
export function taskIdOf(value: TaskRefAny | undefined): string {
  return Effect.runSync(taskIdOfEffect(value));
}
function selectProfileValue(
  requested: string | undefined,
  profiles: ResolveBindingOptions["profiles"],
  jobId: string,
): string {
  const available =
    profiles === undefined ? [] : Array.isArray(profiles) ? [...profiles] : Object.keys(profiles);
  const selected =
    requested ??
    (available.length === 1 ? available[0] : available.includes("default") ? "default" : undefined);
  if (selected === undefined) {
    if (profiles === undefined) return "default";
    throw new JobBindingResolutionError(
      available.length === 0 ? "MISSING_JOB_PROFILE" : "AMBIGUOUS_JOB_PROFILE",
      `Job "${jobId}" requires a jobs provider profile.`,
    );
  }
  if (available.length > 0 && !available.includes(selected))
    throw new JobBindingResolutionError(
      "UNKNOWN_JOB_PROFILE",
      `Job "${jobId}" selected unknown profile "${selected}".`,
    );
  return selected;
}
function taskIdOfValue(value: TaskRefAny | undefined): string {
  return value?.ref?.kind === "task" ? value.ref.id : "";
}
