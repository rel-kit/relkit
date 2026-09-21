import type { JsonValue } from "@relkit/contracts";
import { selectedProviderProfile } from "./normalize-graph-app.js";
import { clean } from "./normalize-graph-utils.js";
import type { GraphNode, NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { isRecord, refId, taskSchemaKey } from "./normalize-utils.js";
import { computeJobBuildId, serviceGenerationFor } from "./jobs/build-id.js";

interface GraphNodeBase {
  readonly id: string;
  readonly source: NormalizedDescriptor["source"];
  readonly domainId?: string;
}

export function jobGraphNode(
  base: GraphNodeBase,
  value: Record<string, any>,
  descriptor: NormalizedDescriptor,
  work: NormalizationWork,
  application: unknown,
): GraphNode {
  if (isRecord(value.task) && refId(value.task) !== undefined) {
    const taskValue = value.task;
    const taskId = refId(taskValue)!;
    const taskVersion =
      typeof taskValue.version === "string"
        ? taskValue.version
        : typeof value.version === "string"
          ? value.version
          : "";
    const buildId =
      typeof value.buildId === "string" && value.buildId.length > 0
        ? value.buildId
        : computeJobBuildId(descriptor, work);
    return {
      ...base,
      kind: "job",
      executionModel: "task",
      name: typeof value.name === "string" ? value.name : "",
      jobId: descriptor.id,
      taskId,
      taskVersion,
      ...(buildId === undefined ? {} : { buildId }),
      profile:
        selectedProviderProfile(application, "job", text(value.service ?? value.profile)) ??
        "default",
      serviceGeneration: serviceGenerationFor(work, descriptor),
      implicit: value.implicit === true,
      default: value.default === true,
      input: schema(work, descriptor, "input"),
      output: schema(work, descriptor, "output"),
      schemaHashes: schemaHashes(work, taskId, ["input", "output", "progress"]),
      errors: clean(value.errors),
      progress: schema(work, descriptor, "progress"),
      streams: clean(value.streams),
      policy: clean(value.policy ?? { admission: value.admission }),
      schedules: clean(value.schedules ?? value.schedule),
      admission: clean(value.admission),
      client: clean(value.client),
      capabilities: clean(value.capabilities),
      compatibility: clean(value.compatibility),
    };
  }
  return {
    ...base,
    kind: "job",
    input: schema(work, descriptor, "input"),
    targetFunctionId: refId(value.target) ?? "",
    profile: selectedProviderProfile(application, "job", text(value.profile)) ?? "default",
    retry: clean(value.retry),
    timeoutMs: clean(value.timeoutMs),
    concurrency: clean(value.concurrency),
    schedule: clean(value.schedule),
    idempotency: clean(value.idempotency),
  };
}

export function dependencyMetadata(value: unknown): JsonValue {
  const cleaned = clean(value);
  if (!isRecord(value) || !isRecord(value.agents) || !isRecord(cleaned)) return cleaned;
  const agents = Object.fromEntries(
    Object.entries(value.agents).flatMap(([name, agent]) => {
      const id = refId(agent);
      return id === undefined ? [] : [[name, { ref: { kind: "agent", id } }]];
    }),
  );
  return { ...cleaned, agents };
}

export function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function schema(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  field: string,
): JsonValue {
  if (descriptor.kind === "task") {
    const direction = field === "input" ? "input" : "output";
    return work.schemas.get(taskSchemaKey(descriptor.id, field, direction)) ?? null;
  }
  if (descriptor.kind === "job" && isRecord(descriptor.value) && isRecord(descriptor.value.task)) {
    const taskId = refId(descriptor.value.task);
    if (taskId !== undefined) {
      const direction = field === "input" ? "input" : "output";
      return work.schemas.get(taskSchemaKey(taskId, field, direction)) ?? null;
    }
  }
  return work.schemas.get(`${descriptor.id}:${field}`) ?? null;
}

export function schemaHashes(
  work: NormalizationWork,
  taskId: string,
  fields: readonly string[],
): JsonValue {
  const result: Record<string, string> = {};
  for (const field of fields) {
    for (const direction of ["input", "output"] as const) {
      const key = taskSchemaKey(taskId, field, direction);
      const hash = work.schemaHashes.get(key);
      if (hash !== undefined) result[`${field}:${direction}`] = hash;
    }
  }
  return result;
}
