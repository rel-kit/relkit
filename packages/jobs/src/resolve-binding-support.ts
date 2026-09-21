import type { TaskRefAny } from "@relkit/contracts/jobs";
import type { ResolveBindingOptions } from "./resolve-binding-types.js";
import { JobBindingResolutionError } from "./resolve-binding-types.js";

export function selectProfile(
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

export function taskIdOf(value: TaskRefAny | undefined): string {
  return value?.ref?.kind === "task" ? value.ref.id : "";
}
