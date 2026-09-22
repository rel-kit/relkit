import { graphId, isTaskBackedJob } from "@relkit/graph";
import type { NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { refId, refKind } from "./normalize-utils.js";

export function graphIdForDescriptor(descriptor: NormalizedDescriptor): string {
  return graphId(descriptor.kind, descriptor.id, {
    taskBackedJob: descriptor.kind === "job" && isTaskBackedJob(descriptor.value),
  });
}

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

export function graphIdForTaskOrJob(value: unknown): string | undefined {
  const kind = refKind(value);
  const id = refId(value);
  if (kind === undefined || id === undefined) return undefined;
  if (kind === "task") return graphId("task", id);
  if (kind === "job" && isTaskBackedJob(value)) return graphId("job", id, { taskBackedJob: true });
  return id;
}
