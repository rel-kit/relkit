import { observeJobs } from "./observability.js";
import { Effect } from "effect";
import { runJobsSync } from "./compatibility.js";
import { taskReferenceIdEffect } from "./reference.js";
import type { ServiceGeneration } from "./manifest.types.js";
import type { JsonValue } from "@relkit/contracts";
import { providerMaps } from "../normalize-graph-app.js";
import { clean } from "../normalize-graph-utils.js";
import type { NormalizedDescriptor, NormalizationWork } from "../normalize-types.js";
import { isRecord } from "../normalize-utils.js";
import {
  computeJobBuildIdEffect,
  computeTaskBuildIdEffect,
  serviceGenerationForEffect,
} from "./build-id.js";
import type { JobsManifestJob, JobsManifestTask } from "./manifest.js";

/**
 * Projects task metadata using authoritative graph fields when available.
 * @param task - Normalized task descriptor being projected or checked.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @returns A lazy effect yielding the data-only task manifest entry.
 * @remarks Requires no services. Build projection may fail with JsonValueError; unexpected exceptions remain defects.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { taskEntryEffect } from "./manifest-entries.js";
 * // task and work are normalized compiler inputs.
 * const exit = Effect.runSync(Effect.exit(taskEntryEffect(task, work)));
 * ```
 */
export const taskEntryEffect = Effect.fn("Jobs.taskEntry")(
  function* (task: NormalizedDescriptor, work: NormalizationWork) {
    const value = isRecord(task.value) ? task.value : {};
    const node = work.graph?.nodes.find((entry) => entry.id === `task.${task.id}`);
    return {
      id: task.id,
      graphId: `task.${task.id}`,
      version: text(value.version),
      execution: text(value.execution) || "durable",
      buildId:
        typeof node?.buildId === "string"
          ? node.buildId
          : yield* computeTaskBuildIdEffect(task, work),
      schemaHashes: node?.schemaHashes === undefined ? {} : clean(node.schemaHashes),
      policy: node?.policy === undefined ? clean(value.policy ?? {}) : clean(node.policy),
      dependencies:
        node?.dependencies === undefined
          ? clean(value.dependencies ?? {})
          : clean(node.dependencies),
      publishes:
        node?.publishes === undefined ? clean(value.publishes ?? []) : clean(node.publishes),
      resources:
        node?.resources === undefined ? clean(value.resources ?? {}) : clean(node.resources),
    };
  },
  (effect, task, work) => observeJobs("taskEntry", effect, () => ({ tasks: 1 })),
);

/**
 * Projects task metadata using authoritative graph fields when available.
 * @param task - Normalized task descriptor being projected or checked.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @returns the data-only task manifest entry.
 * @see {@link taskEntryEffect} for composition and execution examples.
 */
export function taskEntry(task: NormalizedDescriptor, work: NormalizationWork): JobsManifestTask {
  return runJobsSync(taskEntryEffect(task, work));
}

/**
 * Projects task binding identity, client exposure, and payload-free schedules.
 * @param job - Normalized job binding being projected or checked.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @returns A lazy effect yielding the data-only job manifest entry.
 * @remarks Requires no services. Build projection may fail with JsonValueError; unexpected exceptions remain defects.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { jobEntryEffect } from "./manifest-entries.js";
 * // job and work are normalized; schedule payloads are omitted from the resulting entry.
 * const exit = Effect.runSync(Effect.exit(jobEntryEffect(job, work)));
 * ```
 */
export const jobEntryEffect = Effect.fn("Jobs.jobEntry")(
  function* (job: NormalizedDescriptor, work: NormalizationWork) {
    const value = isRecord(job.value) ? job.value : {};
    const taskId = (yield* taskReferenceIdEffect(value.task)) ?? "";
    const node = work.graph?.nodes.find((entry) => entry.id === `job.${job.id}`);
    const generation = yield* serviceGenerationForEffect(work, job);
    const buildId =
      typeof node?.buildId === "string"
        ? node.buildId
        : ((yield* computeJobBuildIdEffect(job, work)) ?? "");
    return {
      id: job.id,
      graphId: `job.${job.id}`,
      name: text(value.name),
      taskId,
      taskVersion: text(isRecord(value.task) ? value.task.version : value.version),
      buildId,
      profile: text(node?.profile ?? value.service ?? value.profile) || "default",
      serviceGeneration:
        typeof node?.serviceGeneration === "string" ? node.serviceGeneration : generation,
      implicit: value.implicit === true,
      default: value.default === true,
      client: clientProjection(value.client),
      policy: clean(node?.policy ?? value.policy ?? {}),
      schedules: Array.isArray(value.schedules ?? value.schedule)
        ? (value.schedules ?? value.schedule).map(stripScheduleInput)
        : [],
      compatibility: clean(value.compatibility ?? {}),
    };
  },
  (effect, job, work) => observeJobs("jobEntry", effect, () => ({ jobs: 1 })),
);

/**
 * Projects task binding identity, client exposure, and payload-free schedules.
 * @param job - Normalized job binding being projected or checked.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @returns the data-only job manifest entry.
 * @see {@link jobEntryEffect} for composition and execution examples.
 */
export function jobEntry(job: NormalizedDescriptor, work: NormalizationWork): JobsManifestJob {
  return runJobsSync(jobEntryEffect(job, work));
}

/**
 * Keeps public client capabilities while excluding executable authorization callbacks.
 * @param value - Client exposure metadata.
 * @returns the JSON client exposure projection.
 */
export function clientProjection(value: unknown): JsonValue {
  if (!isRecord(value)) return {};
  return clean({
    ...(value.public === true ? { public: true } : {}),
    ...(Array.isArray(value.operations) ? { operations: value.operations } : {}),
    ...(Array.isArray(value.fields) ? { fields: value.fields } : {}),
    ...(Array.isArray(value.streams) ? { streams: value.streams } : {}),
  });
}

/**
 * Removes accepted input payloads from public schedule metadata.
 * @param value - Schedule definition that may contain accepted input.
 * @returns the JSON schedule definition without input.
 */
export function stripScheduleInput(value: unknown): JsonValue {
  if (!isRecord(value)) return clean(value);
  const { input: _input, ...definition } = value;
  return clean(definition);
}

/**
 * Deduplicates and sorts provider profile/generation pairs.
 * @param jobs - Job descriptors or manifest entries to project in stable order.
 * @returns the ordered distinct service generations.
 */
export function uniqueGenerations(jobs: readonly JobsManifestJob[]): readonly ServiceGeneration[] {
  const values = new Map(
    jobs.map((job) => [
      `${job.profile}\0${job.serviceGeneration}`,
      { profile: job.profile, generation: job.serviceGeneration },
    ]),
  );
  return [...values.values()].sort(
    (a, b) => a.profile.localeCompare(b.profile) || a.generation.localeCompare(b.generation),
  );
}

/**
 * Projects jobs provider local recipes from the application descriptor.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @returns the JSON recipe references in provider order.
 */
export function recipeReferences(work: NormalizationWork): readonly JsonValue[] {
  const application = work.descriptors.find((entry) => entry.kind === "app")?.value;
  if (!isRecord(application)) return [];
  return providerMaps(application)
    .filter(([capability]) => capability === "job")
    .flatMap(([, profiles]) =>
      isRecord(profiles)
        ? Object.values(profiles).flatMap((binding) =>
            isRecord(binding) && binding.local !== undefined ? [clean(binding.local)] : [],
          )
        : [],
    );
}

/**
 * Collects certified jobs provider compatibility report hashes.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @returns the sorted compatibility report hashes.
 */
export function compatibilityHashes(work: NormalizationWork): readonly string[] {
  const application = work.descriptors.find((entry) => entry.kind === "app")?.value;
  if (!isRecord(application)) return [];
  return providerMaps(application)
    .filter(([capability]) => capability === "job")
    .flatMap(([, profiles]) =>
      isRecord(profiles)
        ? Object.values(profiles).flatMap((binding) => {
            const adapter = isRecord(binding) && isRecord(binding.adapter) ? binding.adapter : {};
            const behavior = isRecord(adapter.behavior) ? adapter.behavior : {};
            return typeof behavior.compatibilityReportHash === "string"
              ? [behavior.compatibilityReportHash]
              : [];
          })
        : [],
    )
    .sort();
}

/**
 * Reads textual metadata without coercing other values.
 * @param value - Untrusted textual metadata.
 * @returns the textual value or the module's absent-value fallback.
 */
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
