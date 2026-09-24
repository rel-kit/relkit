import { Effect } from "effect";
import { observeGraph } from "./graph-observability.js";
import { canonicalizeValue, sortJsonEdges, sortJsonNodes } from "./hash-canonicalize.js";
import { knownFailure, runHash } from "./hash-errors.js";
import type { HashFailure } from "./hash-errors.types.js";
import type { GraphCanonicalizationOptions } from "./hash.types.js";
/**
 * Sorts JSON-safe graph nodes after canonicalization.
 * @param nodes - Graph node objects.
 * @param options - Optional project root.
 * @returns Canonical sorted nodes, or a tagged canonicalization, path, or JSON error.
 * @example Effect.runSync(sortGraphNodesEffect([{ kind: "app", id: "orders" }]));
 */
export function sortGraphNodesEffect<T extends object>(
  nodes: readonly T[],
  options: GraphCanonicalizationOptions = {},
): Effect.Effect<readonly T[], HashFailure> {
  return observeGraph(
    "hash.sort-nodes",
    Effect.try({
      try: () =>
        sortJsonNodes(
          nodes.map((node) => canonicalizeValue(node, options, "node")),
        ) as readonly T[],
      catch: (error) => error,
    }).pipe(Effect.catch(knownFailure)),
  );
}
/**
 * Synchronous compatibility adapter for graph node sorting.
 * @param nodes - Graph node objects.
 * @param options - Optional project root.
 * @returns Canonical sorted nodes.
 * @throws TypeError or a tagged contract error for invalid input.
 * @example sortGraphNodes([{ kind: "app", id: "orders" }]);
 */
export function sortGraphNodes<T extends object>(
  nodes: readonly T[],
  options: GraphCanonicalizationOptions = {},
): readonly T[] {
  return runHash(sortGraphNodesEffect(nodes, options));
}
/**
 * Sorts JSON-safe graph edges after canonicalization.
 * @param edges - Graph edge objects.
 * @param options - Optional project root.
 * @returns Canonical sorted edges, or a tagged canonicalization, path, or JSON error.
 * @example Effect.runSync(sortGraphEdgesEffect([{ kind: "calls-function", from: "a", to: "b" }]));
 */
export function sortGraphEdgesEffect<T extends object>(
  edges: readonly T[],
  options: GraphCanonicalizationOptions = {},
): Effect.Effect<readonly T[], HashFailure> {
  return observeGraph(
    "hash.sort-edges",
    Effect.try({
      try: () =>
        sortJsonEdges(
          edges.map((edge) => canonicalizeValue(edge, options, "edge")),
        ) as readonly T[],
      catch: (error) => error,
    }).pipe(Effect.catch(knownFailure)),
  );
}
/**
 * Synchronous compatibility adapter for graph edge sorting.
 * @param edges - Graph edge objects.
 * @param options - Optional project root.
 * @returns Canonical sorted edges.
 * @throws TypeError or a tagged contract error for invalid input.
 * @example sortGraphEdges([{ kind: "calls-function", from: "a", to: "b" }]);
 */
export function sortGraphEdges<T extends object>(
  edges: readonly T[],
  options: GraphCanonicalizationOptions = {},
): readonly T[] {
  return runHash(sortGraphEdgesEffect(edges, options));
}
