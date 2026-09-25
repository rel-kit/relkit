import { Effect } from "effect";
import { observeGraph, runGraph } from "./graph-observability.js";
import type { GraphEdgeKind } from "./graph-edges.types.js";
export type {
  GraphEdgeKind,
  GraphEdgeBase,
  TargetsFunctionEdge,
  TargetsTaskEdge,
  UsesMiddlewareEdge,
  UsesHookEdge,
  GraphEdge,
} from "./graph-edges.types.js";
export const GRAPH_EDGE_KINDS = [
  "targets-function",
  "targets-task",
  "calls-function",
  "enqueues-job",
  "triggers-job",
  "triggers-task",
  "publishes-event",
  "listens-to-event",
  "uses-bucket",
  "uses-cache",
  "invokes-agent",
  "exposes-as-tool",
  "uses-tool",
  "uses-provider-profile",
  "exposes-function",
  "exposes-event",
  "exposes-task",
  "exposes-job",
  "depends-on-service",
  "mounts-service",
  "declares-error",
  "uses-middleware",
  "uses-hook",
] as const;
/**
 * Checks whether a value names a supported declared graph edge.
 * @param value - Candidate edge kind.
 * @returns An Effect containing the boolean result; it has no expected failure.
 * @example Effect.runSync(isGraphEdgeKindEffect("calls-function"));
 */
export function isGraphEdgeKindEffect(value: unknown): Effect.Effect<boolean> {
  return observeGraph(
    "model.is-edge-kind",
    Effect.sync(
      () => typeof value === "string" && (GRAPH_EDGE_KINDS as readonly string[]).includes(value),
    ),
  );
}
/**
 * Synchronous compatibility adapter for graph edge kind detection.
 * @param value - Candidate edge kind.
 * @returns Whether the value is a declared edge kind.
 * @example isGraphEdgeKind("calls-function");
 */
export function isGraphEdgeKind(value: unknown): value is GraphEdgeKind {
  return runGraph(isGraphEdgeKindEffect(value));
}
