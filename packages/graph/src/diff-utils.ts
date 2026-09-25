import { canonicalJson, type JsonValue } from "@relkit/contracts";
import { Effect } from "effect";
import { observeGraph, runGraph } from "./graph-observability.js";
import type { GraphNode } from "./model.js";
import type { GraphDiffCategory } from "./diff-types.types.js";
/**
 * Builds a stable category and ID key for diffing.
 * @param node - Graph node to identify.
 * @returns An Effect containing string; it has no expected failure.
 * @example Effect.runSync(nodeKeyEffect(node));
 */
export function nodeKeyEffect(node: GraphNode): Effect.Effect<string> {
  return observeGraph(
    "diff.node-key",
    Effect.sync(() => nodeKeyUnsafe(node)),
  );
}
/**
 * Synchronous compatibility adapter for builds a stable category and id key for diffing.
 * @param node - Graph node to identify.
 * @returns string.
 * @example nodeKey(node);
 */
export function nodeKey(node: GraphNode): string {
  return runGraph(nodeKeyEffect(node));
}
/**
 * Finds the runtime capability family of a node.
 * @param node - Graph node to categorize.
 * @returns An Effect containing GraphDiffCategory | undefined; it has no expected failure.
 * @example Effect.runSync(categoryForEffect(node));
 */
export function categoryForEffect(node: GraphNode): Effect.Effect<GraphDiffCategory | undefined> {
  return observeGraph(
    "diff.category",
    Effect.sync(() => categoryForUnsafe(node)),
  );
}
/**
 * Synchronous compatibility adapter for finds the runtime capability family of a node.
 * @param node - Graph node to categorize.
 * @returns GraphDiffCategory | undefined.
 * @example categoryFor(node);
 */
export function categoryFor(node: GraphNode): GraphDiffCategory | undefined {
  return runGraph(categoryForEffect(node));
}
/**
 * Produces the contract-only value of a node.
 * @param node - Graph node to strip of source location.
 * @returns An Effect containing JsonValue; it has no expected failure.
 * @example Effect.runSync(contractValueEffect(node));
 */
export function contractValueEffect(node: GraphNode): Effect.Effect<JsonValue> {
  return observeGraph(
    "diff.contract-value",
    Effect.sync(() => contractValueUnsafe(node)),
  );
}
/**
 * Synchronous compatibility adapter for produces the contract-only value of a node.
 * @param node - Graph node to strip of source location.
 * @returns JsonValue.
 * @example contractValue(node);
 */
export function contractValue(node: GraphNode): JsonValue {
  return runGraph(contractValueEffect(node));
}
/**
 * Finds changed top-level contract fields.
 * @param before - Previous contract value.
 * @param after - New contract value.
 * @returns An Effect containing readonly string[]; it has no expected failure.
 * @example Effect.runSync(changedFieldsEffect(before, after));
 */
export function changedFieldsEffect(
  before: JsonValue,
  after: JsonValue,
): Effect.Effect<readonly string[]> {
  return observeGraph(
    "diff.changed-fields",
    Effect.sync(() => changedFieldsUnsafe(before, after)),
  );
}
/**
 * Synchronous compatibility adapter for finds changed top-level contract fields.
 * @param before - Previous contract value.
 * @param after - New contract value.
 * @returns readonly string[].
 * @example changedFields(before, after);
 */
export function changedFields(before: JsonValue, after: JsonValue): readonly string[] {
  return runGraph(changedFieldsEffect(before, after));
}
function nodeKeyUnsafe(node: GraphNode): string {
  return `${categoryFor(node)}\0${node.id}`;
}
function categoryForUnsafe(node: GraphNode): GraphDiffCategory | undefined {
  if (node.kind === "trigger") {
    if (node.triggerType === "http") return "route";
    if (node.triggerType === "event") return "event";
    return "job";
  }
  if (node.kind === "function") return "function/error";
  if (node.kind === "event") return "event";
  if (node.kind === "job") return "job";
  if (node.kind === "bucket" || node.kind === "cache") return "bucket/cache";
  if (node.kind === "tool") return "tool";
  if (node.kind === "agent") return "agent";
  if (node.kind === "provider") return "profile";
  if (node.kind === "service") return "service";
  return undefined;
}
function contractValueUnsafe(node: GraphNode): JsonValue {
  return withoutSource(node);
}
function changedFieldsUnsafe(before: JsonValue, after: JsonValue): readonly string[] {
  if (!isRecord(before) || !isRecord(after)) return ["value"];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => !same(before[key], after[key])).sort();
}
function withoutSource(node: GraphNode): JsonValue {
  const { source: _source, ...value } = node;
  return value as JsonValue;
}
function same(left: unknown, right: unknown): boolean {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return Object.is(left, right);
  }
}
function isRecord(value: unknown): value is Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
