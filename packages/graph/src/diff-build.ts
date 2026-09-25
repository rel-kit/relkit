import { canonicalJson, type JsonValue } from "@relkit/contracts";
import { Effect } from "effect";
import { observeGraph } from "./graph-observability.js";
import type { ApplicationGraph, GraphNode } from "./model.js";
import { categoryFor, changedFields, contractValue, nodeKey } from "./diff-utils.js";
import { classifyChange } from "./diff-classification.js";
import type { GraphChange, GraphDiff, GraphDiffClassification } from "./diff-types.js";
/**
 * Builds a deterministic compatibility report from canonical graphs.
 * @param before - Canonical graph before the change.
 * @param after - Canonical graph after the change.
 * @returns An Effect containing the ordered diff; it has no expected failure.
 * @example Effect.runSync(buildDiffEffect(before, after));
 */
export function buildDiffEffect(
  before: ApplicationGraph,
  after: ApplicationGraph,
): Effect.Effect<GraphDiff> {
  return observeGraph(
    "diff.build",
    Effect.sync(() => buildDiff(before, after)),
  );
}
function buildDiff(before: ApplicationGraph, after: ApplicationGraph): GraphDiff {
  const beforeNodes = nodesByKey(before.nodes);
  const afterNodes = nodesByKey(after.nodes);
  const keys = [...new Set([...beforeNodes.keys(), ...afterNodes.keys()])].sort();
  const changes = keys.flatMap((key) => makeChanges(beforeNodes.get(key), afterNodes.get(key)));
  const ordered = changes.sort(compareChanges);
  return Object.freeze({
    changes: Object.freeze(ordered),
    hasBreakingChanges: ordered.some((change) => change.classification === "breaking"),
    highestClassification: highest(ordered),
  });
}
function nodesByKey(nodes: readonly GraphNode[]): Map<string, GraphNode> {
  return new Map(
    nodes.flatMap((node) => (categoryFor(node) === undefined ? [] : [[nodeKey(node), node]])),
  );
}
function makeChanges(left: GraphNode | undefined, right: GraphNode | undefined): GraphChange[] {
  const node = right ?? left;
  const category = node === undefined ? undefined : categoryFor(node);
  if (node === undefined || category === undefined) return [];
  if (left === undefined) return [entry(category, right!, "added", [], undefined, right)];
  if (right === undefined) return [entry(category, left, "removed", [], left, undefined)];
  const fields = changedFields(contractValue(left), contractValue(right));
  if (fields.length === 0) {
    if (canonicalJson(left.source) === canonicalJson(right.source)) return [];
    return [entry(category, right, "source-moved", ["source"], left, right)];
  }
  return [entry(category, right, "changed", fields, left, right)];
}
function entry(
  category: NonNullable<ReturnType<typeof categoryFor>>,
  node: GraphNode,
  change: GraphChange["change"],
  fields: readonly string[],
  before: GraphNode | undefined,
  after: GraphNode | undefined,
): GraphChange {
  const source =
    before && after && !sameSource(before, after)
      ? { before: before.source, after: after.source }
      : undefined;
  const result: GraphChange = {
    category,
    kind: node.kind,
    id: node.id,
    change,
    classification: classifyChange(category, change, fields, before, after),
    fields: [...fields].sort(),
    details: details(change, fields),
    ...(source === undefined ? {} : { source }),
    ...(before === undefined ? {} : { before: before as unknown as JsonValue }),
    ...(after === undefined ? {} : { after: after as unknown as JsonValue }),
  };
  return result;
}
function details(change: GraphChange["change"], fields: readonly string[]): readonly string[] {
  const values = [...fields];
  if (change === "added") values.push("added");
  if (change === "removed") values.push("removed");
  if (change === "source-moved") values.push("source moved");
  return [...new Set(values)].sort();
}
function sameSource(left: GraphNode, right: GraphNode): boolean {
  return canonicalJson(left.source) === canonicalJson(right.source);
}
function compareChanges(left: GraphChange, right: GraphChange): number {
  return (
    left.category.localeCompare(right.category) ||
    left.id.localeCompare(right.id) ||
    left.change.localeCompare(right.change)
  );
}
function highest(changes: readonly GraphChange[]): GraphDiffClassification | undefined {
  const order: readonly GraphDiffClassification[] = [
    "informational",
    "compatible",
    "potentially-breaking",
    "breaking",
  ];
  return changes.reduce<GraphDiffClassification | undefined>((current, change) => {
    if (current === "breaking") return current;
    if (current === undefined || order.indexOf(change.classification) > order.indexOf(current)) {
      return change.classification;
    }
    return current;
  }, undefined);
}
