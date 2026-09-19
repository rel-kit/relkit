import type { JsonValue } from "@relkit/contracts";
import {
  cursorSecret,
  decodeCursor,
  encodeCursor,
  type InspectorCursor,
} from "./filters.js";
import { InspectorJobsError, type InspectorJobsServices } from "./types.js";
import { identity, isRecord, safeJson, type ResolvedActiveGeneration } from "../shared.js";

export interface JobDefinitionRecord {
  readonly id: string;
  readonly name: string;
  readonly jobId: string;
  readonly taskId: string;
  readonly taskVersion: string;
  readonly buildId?: string;
  readonly service: string;
  readonly serviceGeneration?: string;
  readonly implicit: boolean;
  readonly default: boolean;
  readonly execution: string;
  readonly schema?: JsonValue;
  readonly contextDependencies?: JsonValue;
  readonly policy?: JsonValue;
  readonly resources?: JsonValue;
  readonly hooks?: JsonValue;
  readonly capabilities?: JsonValue;
  readonly schedules?: JsonValue;
  readonly worker: JsonValue;
  readonly health: string;
  readonly retired: boolean;
  readonly source?: JsonValue;
}

export async function listJobDefinitions(
  generation: ResolvedActiveGeneration,
  request: Request,
  jobs?: InspectorJobsServices,
): Promise<JsonValue> {
  const params = new URL(request.url).searchParams;
  const filters = {
    search: text(params.get("search")),
    job: text(params.get("job")),
    task: text(params.get("task")),
    service: text(params.get("service")),
    limit: definitionLimit(params.get("limit")),
  };
  const all = definitions(generation, await serviceHealth(jobs));
  const filtered = all.filter((item) => matches(item, filters));
  const cursorValue = params.get("cursor");
  const expected = { kind: "definitions" as const, generationId: generation.generationId, graphHash: generation.graphHash, filters: filtersJson(filters) };
  const position = cursorValue === null
    ? 0
    : decodeCursor(cursorValue, expected, cursorSecret(jobs?.cursorSecret, generation.graphHash)).position;
  const start = readPosition(position);
  const items = filtered.slice(start, start + filters.limit);
  const next = start + items.length;
  const projected = items.map(projectDefinition);
  const body: Record<string, unknown> = { ...identity(generation), items: projected };
  if (next < filtered.length) body.nextCursor = encodeCursor({ ...expected, position: next }, cursorSecret(jobs?.cursorSecret, generation.graphHash));
  const safe = safeJson(body);
  return isRecord(safe) ? { ...safe, items: projected } as JsonValue : safe;
}

export async function getJobDefinition(
  generation: ResolvedActiveGeneration,
  id: string,
  jobs?: InspectorJobsServices,
): Promise<JsonValue> {
  const item = definitions(generation, await serviceHealth(jobs)).find((value) => value.id === id || value.jobId === id || value.name === id);
  if (item === undefined) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_NOT_FOUND", 404);
  const definition = projectDefinition(item);
  const response = safeJson({ ...identity(generation), definition });
  return isRecord(response) ? { ...response, definition } as JsonValue : response;
}

export function getTaskDefinition(generation: ResolvedActiveGeneration, id: string): JsonValue {
  const nodes = graphNodes(generation).filter((node) => node.kind === "task");
  const node = nodes.find((value) => value.id === id || value.taskId === id);
  if (node === undefined) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_NOT_FOUND", 404);
  const task = safeJson({
    ...node,
    versions: typeof node.version === "string" ? [node.version] : [],
    lifecycleHooks: { onStart: node.onStart, onSuccess: node.onSuccess, onFailure: node.onFailure },
  });
  return safeJson({ ...identity(generation), task });
}

export function definitionRecords(generation: ResolvedActiveGeneration): readonly JobDefinitionRecord[] {
  return definitions(generation);
}

function definitions(generation: ResolvedActiveGeneration, health = new Map<string, string>()): JobDefinitionRecord[] {
  const nodes = graphNodes(generation);
  const tasks = new Map(nodes.filter((node) => node.kind === "task").map((node) => [String(node.taskId), node]));
  const hooks = new Map<string, unknown[]>();
  for (const node of nodes) if (node.kind === "hook" && typeof node.ownerId === "string") hooks.set(node.ownerId, [...(hooks.get(node.ownerId) ?? []), node]);
  return nodes.filter((node) => node.kind === "job" && node.executionModel === "task").map((job) => {
    const task = tasks.get(String(job.taskId));
    const service = String(job.profile ?? "default");
    return {
      id: String(job.id), name: String(job.name ?? job.id), jobId: String(job.jobId ?? job.id), taskId: String(job.taskId),
      taskVersion: String(job.taskVersion ?? task?.version ?? ""),
      ...(typeof job.buildId === "string" ? { buildId: job.buildId } : {}),
      service, ...(typeof job.serviceGeneration === "string" ? { serviceGeneration: job.serviceGeneration } : {}),
      implicit: job.implicit === true, default: job.default === true, execution: String(task?.execution ?? "durable"),
      ...(task?.input === undefined ? {} : { schema: safeJson({ input: task.input, output: task.output, errors: task.errors }) }),
      ...(task?.dependencies === undefined ? {} : { contextDependencies: safeJson(task.dependencies) }),
      ...(task?.policy === undefined && job.policy === undefined ? {} : { policy: safeJson(job.policy ?? task?.policy) }),
      ...(task?.resources === undefined ? {} : { resources: safeJson(task.resources) }),
      ...(hooks.get(`task.${job.taskId}`) === undefined && task?.onStart === undefined && task?.onSuccess === undefined && task?.onFailure === undefined ? {} : { hooks: safeJson({ graph: hooks.get(`task.${job.taskId}`), onStart: task?.onStart, onSuccess: task?.onSuccess, onFailure: task?.onFailure }) }),
      ...(job.capabilities === undefined ? {} : { capabilities: safeJson(job.capabilities) }),
      ...(job.schedules === undefined ? {} : { schedules: safeJson(job.schedules) }),
      worker: safeJson({ buildId: job.buildId, service: job.profile, serviceGeneration: job.serviceGeneration }),
      health: health.get(service) ?? "unknown", retired: false,
      ...(job.source === undefined ? {} : { source: safeJson(job.source) }),
    };
  }).sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

async function serviceHealth(jobs: InspectorJobsServices | undefined): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (jobs === undefined) return result;
  for (const binding of await bindings(jobs)) {
    try {
      const value = binding.health === undefined ? undefined : await binding.health();
      result.set(binding.service, isRecord(value) && typeof value.state === "string" ? value.state : typeof value === "string" ? value : binding.health === undefined ? "unknown" : "available");
    }
    catch { result.set(binding.service, "unavailable"); }
  }
  return result;
}

async function bindings(jobs: InspectorJobsServices): Promise<readonly import("./types.js").InspectorJobsBinding[]> {
  return typeof jobs.bindings === "function" ? await jobs.bindings() : jobs.bindings;
}
function graphNodes(generation: ResolvedActiveGeneration): Record<string, unknown>[] {
  return isRecord(generation.graph) && Array.isArray(generation.graph.nodes)
    ? generation.graph.nodes.filter(isRecord)
    : [];
}
function matches(item: JobDefinitionRecord, filters: { search?: string | undefined; job?: string | undefined; task?: string | undefined; service?: string | undefined }): boolean {
  if (filters.job !== undefined && item.jobId !== filters.job && item.name !== filters.job) return false;
  if (filters.task !== undefined && item.taskId !== filters.task) return false;
  if (filters.service !== undefined && item.service !== filters.service) return false;
  return filters.search === undefined || [item.name, item.jobId, item.taskId, item.service].some((value) => value.toLowerCase().includes(filters.search!));
}
function filtersJson(value: Record<string, unknown>): JsonValue { return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as JsonValue; }
function readPosition(value: JsonValue): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
  return value;
}
function definitionLimit(value: string | null): number {
  if (value === null || value === "") return 25;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1 || result > 100) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, "limit is invalid");
  return result;
}
function projectDefinition(item: JobDefinitionRecord): JsonValue {
  const value = safeJson(item);
  return isRecord(value) ? { ...value, service: item.service, ...(item.serviceGeneration === undefined ? {} : { serviceGeneration: item.serviceGeneration }) } as JsonValue : value;
}
function text(value: string | null): string | undefined { return value === null || value.trim() === "" ? undefined : value.trim(); }
