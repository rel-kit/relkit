import type { JsonValue } from "@relkit/contracts";
import { providerMaps } from "../normalize-graph-app.js";
import { clean } from "../normalize-graph-utils.js";
import type { NormalizedDescriptor, NormalizationWork } from "../normalize-types.js";
import { isRecord, refId } from "../normalize-utils.js";
import { computeJobBuildId, computeTaskBuildId, serviceGenerationFor } from "./build-id.js";
import type { JobsManifestJob, JobsManifestTask } from "./manifest.js";

export function taskEntry(task: NormalizedDescriptor, work: NormalizationWork): JobsManifestTask {
  const value = isRecord(task.value) ? task.value : {};
  const node = work.graph?.nodes.find((entry) => entry.id === `task.${task.id}`);
  return {
    id: task.id,
    graphId: `task.${task.id}`,
    version: text(value.version),
    execution: text(value.execution) || "durable",
    buildId: typeof node?.buildId === "string" ? node.buildId : computeTaskBuildId(task, work),
    schemaHashes: node?.schemaHashes === undefined ? {} : clean(node.schemaHashes),
    policy: node?.policy === undefined ? clean(value.policy ?? {}) : clean(node.policy),
    dependencies:
      node?.dependencies === undefined ? clean(value.dependencies ?? {}) : clean(node.dependencies),
    publishes: node?.publishes === undefined ? clean(value.publishes ?? []) : clean(node.publishes),
    resources: node?.resources === undefined ? clean(value.resources ?? {}) : clean(node.resources),
  };
}

export function jobEntry(job: NormalizedDescriptor, work: NormalizationWork): JobsManifestJob {
  const value = isRecord(job.value) ? job.value : {};
  const taskId = refId(value.task) ?? "";
  const node = work.graph?.nodes.find((entry) => entry.id === `job.${job.id}`);
  const generation = serviceGenerationFor(work, job);
  const buildId =
    typeof node?.buildId === "string" ? node.buildId : (computeJobBuildId(job, work) ?? "");
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
}

export function clientProjection(value: unknown): JsonValue {
  if (!isRecord(value)) return {};
  return clean({
    ...(value.public === true ? { public: true } : {}),
    ...(Array.isArray(value.operations) ? { operations: value.operations } : {}),
    ...(Array.isArray(value.fields) ? { fields: value.fields } : {}),
    ...(Array.isArray(value.streams) ? { streams: value.streams } : {}),
  });
}

export function stripScheduleInput(value: unknown): JsonValue {
  if (!isRecord(value)) return clean(value);
  const { input: _input, ...definition } = value;
  return clean(definition);
}

export function uniqueGenerations(
  jobs: readonly JobsManifestJob[],
): readonly { readonly profile: string; readonly generation: string }[] {
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

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
