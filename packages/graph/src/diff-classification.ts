import type { JsonValue } from "@relkit/contracts";
import { Effect } from "effect";
import { observeGraph, runGraph } from "./graph-observability.js";
import type { GraphNode } from "./model.js";
import type {
  GraphDiffCategory,
  GraphDiffChange,
  GraphDiffClassification,
} from "./diff-types.types.js";
/**
 * Classifies the compatibility impact of a graph change.
 * @param category - Runtime capability family.
 * @param change - Structural change kind.
 * @param fields - Changed contract fields.
 * @param before - Previous node when present.
 * @param after - New node when present.
 * @returns An Effect containing the classification; it has no expected failure.
 * @example Effect.runSync(classifyChangeEffect("route", "changed", ["config"], oldRoute, newRoute));
 */
export function classifyChangeEffect(
  category: GraphDiffCategory,
  change: GraphDiffChange,
  fields: readonly string[],
  before: GraphNode | undefined,
  after: GraphNode | undefined,
): Effect.Effect<GraphDiffClassification> {
  return observeGraph(
    "diff.classify",
    Effect.sync(() => classifyChangeUnsafe(category, change, fields, before, after)),
  );
}
/**
 * Synchronous compatibility adapter for change classification.
 * @param category - Runtime capability family.
 * @param change - Structural change kind.
 * @param fields - Changed contract fields.
 * @param before - Previous node when present.
 * @param after - New node when present.
 * @returns Compatibility classification for this change.
 * @example classifyChange("route", "changed", ["config"], oldRoute, newRoute);
 */
export function classifyChange(
  category: GraphDiffCategory,
  change: GraphDiffChange,
  fields: readonly string[],
  before: GraphNode | undefined,
  after: GraphNode | undefined,
): GraphDiffClassification {
  return runGraph(classifyChangeEffect(category, change, fields, before, after));
}
function classifyChangeUnsafe(
  category: GraphDiffCategory,
  change: GraphDiffChange,
  fields: readonly string[],
  before: GraphNode | undefined,
  after: GraphNode | undefined,
): GraphDiffClassification {
  if (change === "source-moved") return "informational";
  if (change === "added") return "compatible";
  if (change === "removed") return "breaking";
  if (category === "route") return "breaking";
  if (category === "function/error") return classifyFunction(fields, before, after);
  if (category === "event") return fields.length === 0 ? "informational" : "breaking";
  if (category === "job") return classifyJob(fields);
  if (category === "bucket/cache") return classifyResource(fields, before, after);
  if (category === "tool") return classifyTool(fields);
  if (category === "agent") return classifyAgent(fields);
  if (category === "service") return classifyService(fields);
  return fields.length === 0 ? "informational" : "potentially-breaking";
}
function classifyFunction(
  fields: readonly string[],
  before: GraphNode | undefined,
  after: GraphNode | undefined,
): GraphDiffClassification {
  if (fields.includes("output") || fields.includes("errors") || fields.includes("invocationMode"))
    return "breaking";
  if (fields.includes("input")) return inputSchemaClass(before, after);
  return fields.length === 0 ? "informational" : "potentially-breaking";
}
function classifyJob(fields: readonly string[]): GraphDiffClassification {
  if (fields.some((field) => ["input", "targetFunctionId", "idempotency"].includes(field)))
    return "breaking";
  return fields.length === 0 ? "informational" : "potentially-breaking";
}
function classifyResource(
  fields: readonly string[],
  before: GraphNode | undefined,
  after: GraphNode | undefined,
): GraphDiffClassification {
  if (fields.some((field) => ["key", "value", "visibility"].includes(field))) return "breaking";
  if (fields.includes("profile")) return "potentially-breaking";
  if (before?.kind === "cache" && after?.kind === "cache" && fields.length > 0) return "breaking";
  return fields.length === 0 ? "informational" : "potentially-breaking";
}
function classifyTool(fields: readonly string[]): GraphDiffClassification {
  if (fields.includes("targetFunctionId")) return "breaking";
  if (fields.some((field) => ["sideEffect", "approval", "timeoutMs"].includes(field)))
    return "potentially-breaking";
  return fields.length === 0 ? "informational" : "compatible";
}
function classifyAgent(fields: readonly string[]): GraphDiffClassification {
  if (fields.some((field) => ["input", "output"].includes(field))) return "breaking";
  return fields.length === 0 ? "informational" : "potentially-breaking";
}
function classifyService(fields: readonly string[]): GraphDiffClassification {
  if (fields.includes("functions") || fields.includes("events")) return "breaking";
  if (fields.includes("capability")) return "potentially-breaking";
  return fields.length === 0 ? "informational" : "compatible";
}
function inputSchemaClass(
  before: GraphNode | undefined,
  after: GraphNode | undefined,
): GraphDiffClassification {
  if (before?.kind !== "function" || after?.kind !== "function") return "potentially-breaking";
  const left = objectSchema(before.input);
  const right = objectSchema(after.input);
  if (!left || !right) return "potentially-breaking";
  const addedRequired = right.required.some((field) => !left.required.includes(field));
  return addedRequired ? "breaking" : "potentially-breaking";
}
function objectSchema(value: JsonValue): { required: readonly string[] } | undefined {
  if (!isRecord(value) || value.type !== "object") return undefined;
  const required = Array.isArray(value.required)
    ? value.required.filter((entry): entry is string => typeof entry === "string")
    : [];
  return { required };
}
function isRecord(value: unknown): value is Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
