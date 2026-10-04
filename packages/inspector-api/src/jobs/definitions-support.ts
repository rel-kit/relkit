import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { runInspectorPromise as runExecutionPromise } from "../native-edge.js";
import { InspectorNativeJobs, inspectorNativeJobsExecution } from "./native.service.js";
import { nativeAttempt } from "../native-edge.js";
import type { JsonValue } from "@relkit/contracts";
import { InspectorJobsError, type InspectorJobsServices } from "./types.js";
import { isRecord, pick, safeJson, type ResolvedActiveGeneration } from "../shared.js";
import type { JobDefinitionRecord } from "./definitions.js";
import type { JobDefinitionFilters } from "./definitions.types.js";

/**
 * Joins task-backed job declarations with their public native health evidence.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param health - Public native health evidence indexed by declared service identity.
 * @returns Stable ordered job definitions without native runtime instances.
 */
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

/**
 * Lazily reads native definition-health evidence in stable declaration order.
 * @param jobs - Optional native job authority and configured read concurrency.
 * @returns Service health requiring InspectorNativeJobs; absent authorities give an empty map.
 */
export const serviceHealthEffect = Effect.fn("InspectorJobs.definitionHealth")(
  function* (jobs: InspectorJobsServices | undefined) {
    const result = new Map<string, string>();
    if (jobs === undefined) return result;
    const bindings = yield* nativeAttempt(() =>
      typeof jobs.bindings === "function" ? jobs.bindings() : jobs.bindings,
    );
    const native = yield* InspectorNativeJobs;
    const pages = yield* native.healthPages(bindings, jobs.maxReadConcurrency);
    for (const { binding, health, available } of pages)
      result.set(
        binding.service,
        !available
          ? "unavailable"
          : isRecord(health) && typeof health.state === "string"
            ? health.state
            : typeof health === "string"
              ? health
              : binding.health === undefined
                ? "unknown"
                : "available",
      );
    return result;
  },
  (effect) => observeExecution("inspector", "jobs.definition-health", effect),
);

/**
 * Reads definition health through the reused compatibility owner.
 * @param jobs - Optional native job authority.
 * @returns Stable service-to-health evidence, retaining unavailable providers.
 */
export function serviceHealth(
  jobs: InspectorJobsServices | undefined,
): Promise<Map<string, string>> {
  return runExecutionPromise(inspectorNativeJobsExecution, serviceHealthEffect(jobs));
}

/**
 * Selects stored object graph nodes for declaration-only queries.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @returns Declaration records or an empty collection when unavailable.
 */
export function graphNodes(generation: ResolvedActiveGeneration): Record<string, unknown>[] {
  return isRecord(generation.graph) && Array.isArray(generation.graph.nodes)
    ? generation.graph.nodes.filter(isRecord).map((node) => pick(node, Object.keys(node)))
    : [];
}

/**
 * Matches a projected job definition against the declared filters.
 * @param item - Selected declaration or native record to project.
 * @param filters - Validated filters bound into the continuation cursor.
 * @returns Whether the public definition matches every supplied selector.
 */
export function matches(item: JobDefinitionRecord, filters: JobDefinitionFilters): boolean {
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

/**
 * Projects present filter fields into the signed cursor identity.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Canonical JSON-compatible filter fields.
 */
export function filtersJson(value: Record<string, unknown>): JsonValue {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as JsonValue;
}

/**
 * Validates the decoded continuation position before using it.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns An accepted continuation position or the existing cursor failure.
 */
export function readPosition(value: JsonValue): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
  return value;
}

/**
 * Validates the bounded job-definition page size.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns A page size between one and one hundred.
 */
export function definitionLimit(value: string | null): number {
  if (value === null || value === "") return 25;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1 || result > 100)
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, "limit is invalid");
  return result;
}

/**
 * Redacts a job declaration while retaining its public service identity.
 * @param item - Selected declaration or native record to project.
 * @returns Public job-definition JSON.
 */
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

/**
 * Normalizes optional query text without creating a default selector.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Trimmed nonempty text or undefined.
 */
export function text(value: string | null): string | undefined {
  return value === null || value.trim() === "" ? undefined : value.trim();
}
