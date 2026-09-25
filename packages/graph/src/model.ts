import { Effect } from "effect";
import { observeGraph, runGraph } from "./graph-observability.js";
import type { GraphNodeKind } from "./model.types.js";
export type * from "./model.types.js";
export { GRAPH_EDGE_KINDS, isGraphEdgeKind, isGraphEdgeKindEffect } from "./graph-edges.js";
/** Supported graph node kinds in canonical protocol order. */
export const GRAPH_NODE_KINDS = [
  "app",
  "env",
  "function",
  "task",
  "error",
  "trigger",
  "job",
  "event",
  "bucket",
  "cache",
  "tool",
  "agent",
  "channel",
  "provider",
  "service",
  "middleware",
  "hook",
] as const;
/**
 * Checks whether a candidate is a supported graph node kind.
 * @param value - Candidate kind.
 * @returns An Effect containing the boolean result; it has no expected failure.
 * @example Effect.runSync(isGraphNodeKindEffect("function"));
 */
export function isGraphNodeKindEffect(value: unknown): Effect.Effect<boolean> {
  return observeGraph(
    "model.is-node-kind",
    Effect.sync(
      () => typeof value === "string" && (GRAPH_NODE_KINDS as readonly string[]).includes(value),
    ),
  );
}
/**
 * Synchronous compatibility adapter for graph node kind detection.
 * @param value - Candidate kind.
 * @returns Whether the value is a supported node kind.
 * @example isGraphNodeKind("function");
 */
export function isGraphNodeKind(value: unknown): value is GraphNodeKind {
  return runGraph(isGraphNodeKindEffect(value));
}
