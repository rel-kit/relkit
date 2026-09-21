import type { JsonValue } from "@relkit/contracts";
import { InspectorJobsError, type InspectorJobsServices } from "./types.js";
import { isRecord, safeJson, type ResolvedActiveGeneration } from "../shared.js";
import type { JobDefinitionRecord } from "./definitions.js";

export function definitions(
  generation: ResolvedActiveGeneration,
  health = new Map<string, string>(),
): JobDefinitionRecord[] {
  const nodes = graphNodes(generation);
  const tasks = new Map(
    nodes.filter((node) => node.kind === "task").map((node) => [String(node.taskId), node]),
  );
  const hooks = new Map<string, unknown[]>();
  for (const node of nodes)
    if (node.kind === "hook" && typeof node.ownerId === "string")
      hooks.set(node.ownerId, [...(hooks.get(node.ownerId) ?? []), node]);
  return nodes
    .filter((node) => node.kind === "job" && node.executionModel === "task")
    .map((job) => {
      const task = tasks.get(String(job.taskId));
      const service = String(job.profile ?? "default");
      return {
        id: String(job.id),
        name: String(job.name ?? job.id),
        jobId: String(job.jobId ?? job.id),
        taskId: String(job.taskId),
        taskVersion: String(job.taskVersion ?? task?.version ?? ""),
        ...(typeof job.buildId === "string" ? { buildId: job.buildId } : {}),
        service,
        ...(typeof job.serviceGeneration === "string"
          ? { serviceGeneration: job.serviceGeneration }
          : {}),
        implicit: job.implicit === true,
        default: job.default === true,
        execution: String(task?.execution ?? "durable"),
        ...(task?.input === undefined
          ? {}
          : { schema: safeJson({ input: task.input, output: task.output, errors: task.errors }) }),
        ...(task?.dependencies === undefined
          ? {}
          : { contextDependencies: safeJson(task.dependencies) }),
        ...(task?.policy === undefined && job.policy === undefined
          ? {}
          : { policy: safeJson(job.policy ?? task?.policy) }),
        ...(task?.resources === undefined ? {} : { resources: safeJson(task.resources) }),
        ...(hooks.get(`task.${job.taskId}`) === undefined &&
        task?.onStart === undefined &&
        task?.onSuccess === undefined &&
        task?.onFailure === undefined
          ? {}
          : {
              hooks: safeJson({
                graph: hooks.get(`task.${job.taskId}`),
                onStart: task?.onStart,
                onSuccess: task?.onSuccess,
                onFailure: task?.onFailure,
              }),
            }),
        ...(job.capabilities === undefined ? {} : { capabilities: safeJson(job.capabilities) }),
        ...(job.schedules === undefined ? {} : { schedules: safeJson(job.schedules) }),
        worker: safeJson({
          buildId: job.buildId,
          service: job.profile,
          serviceGeneration: job.serviceGeneration,
        }),
        health: health.get(service) ?? "unknown",
        retired: false,
        ...(job.source === undefined ? {} : { source: safeJson(job.source) }),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

export async function serviceHealth(
  jobs: InspectorJobsServices | undefined,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (jobs === undefined) return result;
  for (const binding of await bindings(jobs)) {
    try {
      const value = binding.health === undefined ? undefined : await binding.health();
      result.set(
        binding.service,
        isRecord(value) && typeof value.state === "string"
          ? value.state
          : typeof value === "string"
            ? value
            : binding.health === undefined
              ? "unknown"
              : "available",
      );
    } catch {
      result.set(binding.service, "unavailable");
    }
  }
  return result;
}

async function bindings(
  jobs: InspectorJobsServices,
): Promise<readonly import("./types.js").InspectorJobsBinding[]> {
  return typeof jobs.bindings === "function" ? await jobs.bindings() : jobs.bindings;
}

export function graphNodes(generation: ResolvedActiveGeneration): Record<string, unknown>[] {
  return isRecord(generation.graph) && Array.isArray(generation.graph.nodes)
    ? generation.graph.nodes.filter(isRecord)
    : [];
}

export function matches(
  item: JobDefinitionRecord,
  filters: {
    search?: string | undefined;
    job?: string | undefined;
    task?: string | undefined;
    service?: string | undefined;
  },
): boolean {
  if (filters.job !== undefined && item.jobId !== filters.job && item.name !== filters.job)
    return false;
  if (filters.task !== undefined && item.taskId !== filters.task) return false;
  if (filters.service !== undefined && item.service !== filters.service) return false;
  return (
    filters.search === undefined ||
    [item.name, item.jobId, item.taskId, item.service].some((value) =>
      value.toLowerCase().includes(filters.search!),
    )
  );
}

export function filtersJson(value: Record<string, unknown>): JsonValue {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as JsonValue;
}

export function readPosition(value: JsonValue): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
  return value;
}

export function definitionLimit(value: string | null): number {
  if (value === null || value === "") return 25;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1 || result > 100)
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, "limit is invalid");
  return result;
}

export function projectDefinition(item: JobDefinitionRecord): JsonValue {
  const value = safeJson(item);
  return isRecord(value)
    ? ({
        ...value,
        service: item.service,
        ...(item.serviceGeneration === undefined
          ? {}
          : { serviceGeneration: item.serviceGeneration }),
      } as JsonValue)
    : value;
}

export function text(value: string | null): string | undefined {
  return value === null || value.trim() === "" ? undefined : value.trim();
}
