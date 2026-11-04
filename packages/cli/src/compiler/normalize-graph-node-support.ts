import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import type { GraphNodeBase } from "./normalize-graph-node-support.types.js";
import type { JsonValue } from "relkit/contracts";
import { selectedProviderProfile } from "./normalize-graph-app.js";
import { clean } from "./normalize-graph-utils.js";
import type { GraphNode, NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { isRecord, refId, taskSchemaKey } from "./normalize-utils.js";
import { computeJobBuildIdEffect, serviceGenerationForEffect } from "./jobs/build-id.js";

/**
 * Projects task-backed job execution and compatibility metadata.
 * @param base - Stable graph identity and source provenance shared by the job node.
 * @param value - Declared metadata inspected without coercion.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param application - Application descriptor metadata.
 * @returns A lazy effect that projects task-backed job execution and compatibility metadata; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const jobGraphNodeEffect = Effect.fn("Compiler.jobGraphNode")(
  function* (
    base: GraphNodeBase,
    value: Record<string, any>,
    descriptor: NormalizedDescriptor,
    work: NormalizationWork,
    application: unknown,
  ) {
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
          : yield* computeJobBuildIdEffect(descriptor, work);
      return {
        ...base,
        kind: "job",
        executionModel: "task",
        name: typeof value.name === "string" ? value.name : "",
        jobId: descriptor.id,
        taskId,
        taskVersion,
        ...(buildId === undefined ? {} : { buildId }),
        profile: selectedProviderProfile(application, "job", text(value.service)) ?? "default",
        serviceGeneration: yield* serviceGenerationForEffect(work, descriptor),
        implicit: value.implicit === true,
        default: value.default === true,
        input: schema(work, descriptor, "input"),
        output: schema(work, descriptor, "output"),
        schemaHashes: schemaHashes(work, taskId, ["input", "output", "progress"]),
        errors: clean(value.errors),
        progress: schema(work, descriptor, "progress"),
        streams: clean(value.streams),
        policy: clean(value.policy ?? { admission: value.admission }),
        schedules: clean(value.schedules),
        admission: clean(value.admission),
        client: clean(value.client),
        capabilities: clean(value.capabilities),
        compatibility: clean(value.compatibility),
      };
    }
    return {
      ...base,
      kind: "job",
      executionModel: "task",
      name: typeof value.name === "string" ? value.name : "",
      jobId: descriptor.id,
      taskId: "",
      taskVersion: "",
      profile: "default",
      implicit: false,
      default: false,
      input: schema(work, descriptor, "input"),
    };
  },
  (effect, base, value, descriptor, work, application) =>
    observeCompiler("normalization", "jobGraphNode", effect, () => ({})),
);

/**
 * Projects task-backed job execution and compatibility metadata.
 * @param base - Stable graph identity and source provenance shared by the job node.
 * @param value - Declared metadata inspected without coercion.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param application - Application descriptor metadata.
 * @returns The job graph node with its execution and compatibility contracts.
 */
export function jobGraphNode(
  base: GraphNodeBase,
  value: Record<string, any>,
  descriptor: NormalizedDescriptor,
  work: NormalizationWork,
  application: unknown,
): GraphNode {
  return runCompilerSync(jobGraphNodeEffect(base, value, descriptor, work, application));
}

/**
 * Projects dependency metadata with canonical agent references.
 * @param value - Declared metadata inspected without coercion.
 * @returns Serializable dependency metadata with canonical agent references.
 */
export function dependencyMetadata(value: unknown): JsonValue {
  const cleaned = clean(value);
  if (!isRecord(value) || !isRecord(cleaned)) return cleaned;
  const projected: Record<string, JsonValue> = {};
  for (const [category, kind] of Object.entries(referenceCategories)) {
    const map = value[category];
    if (!isRecord(map)) continue;
    projected[category] = Object.fromEntries(
      Object.entries(map).flatMap(([name, target]) => {
        const id = refId(target);
        return id === undefined ? [] : [[name, { ref: { kind, id } }]];
      }),
    );
  }
  return { ...cleaned, ...projected };
}

/**
 * Lists the event IDs declared under `dependencies.events`, sorted.
 * @param value - Declared dependency maps inspected without coercion.
 * @returns Published event IDs.
 */
export function publishedEvents(value: unknown): JsonValue {
  const events = isRecord(value) && isRecord(value.events) ? value.events : {};
  return [...new Set(Object.values(events).flatMap((event) => refId(event) ?? []))].sort();
}

/** Dependency maps recorded in the graph as references rather than whole descriptors. */
const referenceCategories: Readonly<Record<string, string>> = {
  functions: "function",
  events: "event",
  channels: "channel",
  databases: "service",
  agents: "agent",
};

/**
 * Retains a nonempty textual metadata value without coercion.
 * @param value - Declared metadata inspected without coercion.
 * @returns The nonempty string, or undefined without coercion.
 */
export function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Reads directional schema evidence from the compiler-owned schema index.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param field - Declared contract field name.
 * @returns Directional JSON Schema evidence, or null when unavailable.
 */
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

/**
 * Collects known directional schema hashes for a task contract.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param taskId - Stable task descriptor identity.
 * @param fields - Contract field names to project.
 * @returns Known task schema hashes keyed by wire direction.
 */
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
