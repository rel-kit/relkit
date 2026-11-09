import { Effect } from "effect";
import { observeGraph, runGraph } from "./graph-observability.js";

/**
 * Maps a durable ID to its graph-only identity.
 * @param kind - Node kind owning the ID.
 * @param durableId - Public durable identifier.
 * @param options - Whether a job is backed by a task.
 * @returns An Effect containing the graph identity; it has no expected failure.
 * @example Effect.runSync(graphIdEffect("task", "orders.send"));
 */
export function graphIdEffect(
  kind: string,
  durableId: string,
  options: { readonly taskBackedJob?: boolean } = {},
): Effect.Effect<string> {
  return observeGraph(
    "id.graph",
    Effect.sync(() => {
      if (kind === "task") return `task.${durableId}`;
      if (kind === "job" && options.taskBackedJob === true) return `job.${durableId}`;
      return durableId;
    }),
  );
}

/**
 * Synchronous compatibility adapter for graph-only identity mapping.
 * @param kind - Node kind owning the ID.
 * @param durableId - Public durable identifier.
 * @param options - Whether a job is backed by a task.
 * @returns The graph-only identity.
 * @example graphId("task", "orders.send");
 */
export function graphId(
  kind: string,
  durableId: string,
  options: { readonly taskBackedJob?: boolean } = {},
): string {
  return runGraph(graphIdEffect(kind, durableId, options));
}

/**
 * Checks whether a job projection refers to a task.
 * @param value - Candidate job projection.
 * @returns An Effect containing the boolean result; it has no expected failure.
 * @example Effect.runSync(isTaskBackedJobEffect({ task: { ref: { kind: "task" } } }));
 */
export function isTaskBackedJobEffect(value: unknown): Effect.Effect<boolean> {
  return observeGraph(
    "id.is-task-backed-job",
    Effect.sync(
      () =>
        isRecord(value) &&
        isRecord(value.task) &&
        isRecord(value.task.ref) &&
        value.task.ref.kind === "task",
    ),
  );
}

/**
 * Synchronous compatibility adapter for task-backed job detection.
 * @param value - Candidate job projection.
 * @returns Whether the projection contains a task reference.
 * @example isTaskBackedJob({ task: { ref: { kind: "task" } } });
 */
export function isTaskBackedJob(value: unknown): boolean {
  return runGraph(isTaskBackedJobEffect(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
