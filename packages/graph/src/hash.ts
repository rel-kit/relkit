import { createHash } from "node:crypto";
import { serializeJsonEffect, type JsonValue } from "@relkit/contracts";
import { Effect } from "effect";
import { observeGraph } from "./graph-observability.js";
import { canonicalizeValue, sortJsonEdges, sortJsonNodes } from "./hash-canonicalize.js";
import { GraphCanonicalizationError, knownFailure, runHash } from "./hash-errors.js";
import type { HashFailure } from "./hash-errors.types.js";
import type { GraphCanonicalizationOptions, GraphShape } from "./hash.types.js";
export type { GraphCanonicalizationOptions } from "./hash.types.js";
export { GraphCanonicalizationError } from "./hash-errors.js";
export {
  sortGraphNodes,
  sortGraphNodesEffect,
  sortGraphEdges,
  sortGraphEdgesEffect,
} from "./hash-sort.js";
/** Canonical graph digest algorithm. */
export const GRAPH_HASH_ALGORITHM = "sha256" as const;
/** Prefix identifying the graph digest algorithm. */
export const GRAPH_HASH_PREFIX = `${GRAPH_HASH_ALGORITHM}:` as const;
/**
 * Canonicalizes a graph with portable paths and deterministic node and edge order.
 * @param graph - Graph-shaped document.
 * @param options - Optional project root for source path normalization.
 * @returns The canonical graph, or a tagged canonicalization, path, or JSON error.
 * @example Effect.runSync(canonicalizeGraphEffect(graph));
 */
export function canonicalizeGraphEffect<T extends GraphShape>(
  graph: T,
  options: GraphCanonicalizationOptions = {},
): Effect.Effect<T, HashFailure> {
  return observeGraph(
    "hash.canonicalize",
    Effect.try({
      try: () => {
        const normalized = canonicalizeValue(graph, options, "graph");
        if (!isGraphShape(normalized))
          throw new GraphCanonicalizationError({
            message: "A graph must contain nodes and edges arrays.",
          });
        return {
          ...normalized,
          nodes: sortJsonNodes(normalized.nodes),
          edges: sortJsonEdges(normalized.edges),
        } as T;
      },
      catch: (error) => error,
    }).pipe(Effect.catch(knownFailure)),
  );
}
/**
 * Synchronous compatibility adapter for graph canonicalization.
 * @param graph - Graph-shaped document.
 * @param options - Optional project root.
 * @returns The canonical graph.
 * @throws TypeError for an invalid graph shape or non-plain value; tagged contract errors for invalid JSON or paths.
 * @example canonicalizeGraph(graph);
 */
export function canonicalizeGraph<T extends GraphShape>(
  graph: T,
  options: GraphCanonicalizationOptions = {},
): T {
  return runHash(canonicalizeGraphEffect(graph, options));
}
/**
 * Serializes a graph in canonical JSON order.
 * @param graph - Graph-shaped document.
 * @param options - Optional project root.
 * @returns Canonical JSON, or a tagged canonicalization, path, or JSON error.
 * @example Effect.runSync(canonicalGraphJsonEffect(graph));
 */
export function canonicalGraphJsonEffect<T extends GraphShape>(
  graph: T,
  options: GraphCanonicalizationOptions = {},
): Effect.Effect<string, HashFailure> {
  return observeGraph(
    "hash.canonical-json",
    Effect.flatMap(canonicalizeGraphEffect(graph, options), serializeJsonEffect),
  );
}
/**
 * Synchronous compatibility adapter for canonical graph JSON.
 * @param graph - Graph-shaped document.
 * @param options - Optional project root.
 * @returns Canonical JSON without a trailing newline.
 * @throws TypeError or a tagged contract error for invalid input.
 * @example canonicalGraphJson(graph);
 */
export function canonicalGraphJson<T extends GraphShape>(
  graph: T,
  options: GraphCanonicalizationOptions = {},
): string {
  return runHash(canonicalGraphJsonEffect(graph, options));
}
/**
 * Hashes canonical graph bytes as sha256 hexadecimal.
 * @param graph - Graph-shaped document.
 * @param options - Optional project root.
 * @returns A prefixed digest, or a tagged canonicalization, path, or JSON error.
 * @example Effect.runSync(hashGraphEffect(graph));
 */
export function hashGraphEffect<T extends GraphShape>(
  graph: T,
  options: GraphCanonicalizationOptions = {},
): Effect.Effect<string, HashFailure> {
  return observeGraph(
    "hash.hash",
    Effect.map(
      canonicalGraphJsonEffect(graph, options),
      (json) =>
        `${GRAPH_HASH_PREFIX}${createHash(GRAPH_HASH_ALGORITHM).update(json, "utf8").digest("hex")}`,
    ),
  );
}
/**
 * Synchronous compatibility adapter for graph hashing.
 * @param graph - Graph-shaped document.
 * @param options - Optional project root.
 * @returns A prefixed SHA-256 digest.
 * @throws TypeError or a tagged contract error for invalid input.
 * @example hashGraph(graph);
 */
export function hashGraph<T extends GraphShape>(
  graph: T,
  options: GraphCanonicalizationOptions = {},
): string {
  return runHash(hashGraphEffect(graph, options));
}
function isGraphShape(value: JsonValue): value is {
  readonly [key: string]: JsonValue;
  readonly nodes: readonly JsonValue[];
  readonly edges: readonly JsonValue[];
} {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as { readonly [key: string]: JsonValue };
  return Array.isArray(record.nodes) && Array.isArray(record.edges);
}
