import { graphId, isTaskBackedJob } from "@relkit/graph";
import type { NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { refId, refKind } from "./normalize-utils.js";

/**
 * Selects the graph identity for a descriptor.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @returns The canonical graph identity for the descriptor kind and ID.
 */
export function graphIdForDescriptor(descriptor: NormalizedDescriptor): string {
  return graphId(descriptor.kind, descriptor.id, {
    taskBackedJob: descriptor.kind === "job" && isTaskBackedJob(descriptor.value),
  });
}

/**
 * Resolves graph identity from an indexed reference.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param value - Declared metadata inspected without coercion.
 * @returns The referenced descriptor's graph identity, or undefined.
 */
export function graphIdForReference(work: NormalizationWork, value: unknown): string | undefined {
  const kind = refKind(value);
  const id = refId(value);
  if (kind === undefined || id === undefined) return undefined;
  const descriptor = work.referencesByKind.get(kind)?.get(id);
  if (descriptor !== undefined) return graphIdForDescriptor(descriptor);
  if (kind === "task") return graphId("task", id);
  if (kind === "job" && isTaskBackedJob(value)) return graphId("job", id, { taskBackedJob: true });
  return id;
}

/**
 * Selects a task or job graph identity from its declared reference.
 * @param value - Declared metadata inspected without coercion.
 * @returns The task- or job-scoped graph identity, or undefined.
 */
export function graphIdForTaskOrJob(value: unknown): string | undefined {
  const kind = refKind(value);
  const id = refId(value);
  if (kind === undefined || id === undefined) return undefined;
  if (kind === "task") return graphId("task", id);
  if (kind === "job" && isTaskBackedJob(value)) return graphId("job", id, { taskBackedJob: true });
  return id;
}
