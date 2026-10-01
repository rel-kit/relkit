import { observeJobs } from "./observability.js";
import { Effect } from "effect";
import { runJobsSync } from "./compatibility.js";
import { taskReferenceIdEffect } from "./reference.js";
import { providerMaps, selectedProviderProfile } from "../normalize-graph-app.js";
import { add } from "../normalize-pass-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "../normalize-types.js";
import { isRecord } from "../normalize-utils.js";

const FEATURE_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  durable: ["durable", "durable-task", "durable-execution", "durable-sleep", "task-execution"],
  retryable: ["retryable", "retryable-task", "retryable-execution", "task-execution", "retry"],
  schedules: ["schedules", "schedule", "native-schedule", "native-scheduling"],
  observation: ["observation", "read", "run-observation"],
  cancel: ["cancel", "cancellation", "run-cancel"],
  retry: ["retry", "run-retry"],
  streams: ["streams", "named-streams"],
  progress: ["progress", "durable-progress"],
  resources: ["resources", "worker-resources"],
});

/**
 * Checks selected jobs provider capabilities against task and client requirements.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param job - Normalized job binding being projected or checked.
 * @param task - Normalized task descriptor being projected or checked.
 * @returns A lazy effect yielding void after appending unsupported capability diagnostics.
 * @remarks Requires no services. Unexpected exceptions remain defects.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { validateProviderRequirementsEffect } from "./provider-requirements.js";
 * // work includes the application provider map; job and task are resolved descriptors.
 * Effect.runSync(validateProviderRequirementsEffect(work, job, task));
 * ```
 */
export const validateProviderRequirementsEffect = Effect.fn("Jobs.validateProviderRequirements")(
  function* (work: NormalizationWork, job: NormalizedDescriptor, task: NormalizedDescriptor) {
    const application = work.descriptors.find((entry) => entry.kind === "app")?.value;
    if (!isRecord(application)) return;
    const jobValue = isRecord(job.value) ? job.value : {};
    const taskValue = isRecord(task.value) ? task.value : {};
    const profile = selectedProviderProfile(
      application,
      "job",
      text(jobValue.service ?? jobValue.profile),
    );
    if (profile === undefined) return;
    const binding = bindingFor(application, profile);
    if (binding === undefined) return;
    const features = featureSet(binding);
    const required = new Map<string, readonly string[]>();
    required.set(taskValue.execution === "retryable" ? "retryable" : "durable", []);
    if (hasSchedules(jobValue)) required.set("schedules", []);
    if (isRecord(jobValue.client)) {
      const operations = Array.isArray(jobValue.client.operations)
        ? jobValue.client.operations
        : [];
      if (operations.some((operation) => ["get", "list", "watch"].includes(String(operation))))
        required.set("observation", []);
      if (operations.includes("cancel")) required.set("cancel", []);
      if (operations.includes("retry")) required.set("retry", []);
      if (operations.includes("stream")) required.set("streams", []);
    }
    if (taskValue.progress !== undefined || taskValue.observation?.progress !== undefined)
      required.set("progress", []);
    if (isRecord(taskValue.streams) || taskValue.observation?.streams !== undefined)
      required.set("streams", []);
    if (taskValue.resources !== undefined) required.set("resources", []);
    for (const name of required.keys()) {
      const aliases = FEATURE_ALIASES[name] ?? [name];
      if (aliases.some((alias) => features.has(normalizeFeature(alias)))) continue;
      add(
        work,
        job,
        NORMALIZE_CODES.jobCapability,
        `Jobs provider profile "${profile}" does not advertise the ${name} capability required by task "${task.id}".`,
        "error",
        undefined,
        `Select a certified jobs service or remove the ${name} requirement.`,
      );
    }
  },
  (effect, work, job, task) =>
    observeJobs("providerRequirements", effect, () => ({ jobs: 1, tasks: 1 })),
);

/**
 * Checks selected jobs provider capabilities against task and client requirements.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param job - Normalized job binding being projected or checked.
 * @param task - Normalized task descriptor being projected or checked.
 * @returns void after appending unsupported capability diagnostics.
 * @see {@link validateProviderRequirementsEffect} for composition and execution examples.
 */
export function validateProviderRequirements(
  work: NormalizationWork,
  job: NormalizedDescriptor,
  task: NormalizedDescriptor,
): void {
  return runJobsSync(validateProviderRequirementsEffect(work, job, task));
}

/**
 * Looks up the selected jobs provider profile.
 * @param application - Normalized application provider configuration.
 * @param profile - Selected provider profile; omission uses the application's selection.
 * @returns the provider binding or undefined when unavailable.
 */
function bindingFor(application: Record<string, unknown>, profile: string): unknown {
  const profiles = providerMaps(application).find(([capability]) => capability === "job")?.[1];
  return isRecord(profiles) ? profiles[profile] : undefined;
}

/**
 * Normalizes advertised feature strings and feature identifiers.
 * @param binding - Provider binding carrying adapter capability metadata.
 * @returns the set of advertised capability names.
 */
function featureSet(binding: unknown): Set<string> {
  const adapter = isRecord(binding) && isRecord(binding.adapter) ? binding.adapter : {};
  const values = Array.isArray(adapter.features) ? adapter.features : [];
  return new Set(
    values.flatMap((feature) => {
      if (typeof feature === "string") return [normalizeFeature(feature)];
      return isRecord(feature) && typeof feature.id === "string"
        ? [normalizeFeature(feature.id)]
        : [];
    }),
  );
}

/**
 * Checks whether either schedule spelling contains entries.
 * @param value - Value or descriptor to inspect without coercion.
 * @returns whether the job declares a non-empty schedule array.
 */
function hasSchedules(value: Record<string, unknown>): boolean {
  const schedules = value.schedules ?? value.schedule;
  return Array.isArray(schedules) && schedules.length > 0;
}

/**
 * Reads textual metadata without coercing other values.
 * @param value - Untrusted textual metadata.
 * @returns the textual value or the module's absent-value fallback.
 */
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * Normalizes provider feature aliases for compatibility matching.
 * @param value - Value or descriptor to inspect without coercion.
 * @returns the lowercase feature name without punctuation separators.
 */
function normalizeFeature(value: string): string {
  return value.replace(/[._-]/gu, "").toLowerCase();
}

/**
 * Resolves a job's normalized task reference in the authoritative index.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param job - Normalized job binding being projected or checked.
 * @returns A lazy effect yielding the matching task descriptor, or undefined for an unresolved reference.
 * @remarks Requires no services. Missing or invalid IDs remain unresolved; unexpected exceptions remain defects.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { taskForJobEffect } from "./provider-requirements.js";
 * // work is indexed and job is normalized; an unresolved task remains undefined.
 * const resolved = Effect.runSync(taskForJobEffect(work, job));
 * ```
 */
export const taskForJobEffect = Effect.fn("Jobs.taskForJob")(
  function* (work: NormalizationWork, job: NormalizedDescriptor) {
    const value = isRecord(job.value) ? job.value : {};
    const taskId = yield* taskReferenceIdEffect(value.task);
    return taskId === undefined ? undefined : work.referencesByKind.get("task")?.get(taskId);
  },
  (effect, work, job) => observeJobs("resolveTask", effect, () => ({ jobs: 1 })),
);

/**
 * Resolves a job's normalized task reference in the authoritative index.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param job - Normalized job binding being projected or checked.
 * @returns the matching task descriptor, or undefined for an unresolved reference.
 * @see {@link taskForJobEffect} for composition and execution examples.
 */
export function taskForJob(
  work: NormalizationWork,
  job: NormalizedDescriptor,
): NormalizedDescriptor | undefined {
  return runJobsSync(taskForJobEffect(work, job));
}
