import type { GraphCollection, GraphData } from "./graph.types.js";
import { GRAPH_VERSION, type JsonValue } from "@relkit/contracts";
import { isRecord, pick, safeJson } from "./shared.js";
import { projectNode } from "./graph-utils.js";

/**
 * Selects graph nodes and edges before redaction, preserving the declared graph version.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Public graph data, or undefined for an unavailable graph.
 */
export function graphData(value: unknown): GraphData | undefined {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges))
    return undefined;
  const nodes = value.nodes.flatMap((node) => {
    const projected = projectNode(node);
    return projected === undefined ? [] : [projected];
  });
  const edges = value.edges.flatMap((edge) => {
    if (
      !isRecord(edge) ||
      typeof edge.kind !== "string" ||
      typeof edge.from !== "string" ||
      typeof edge.to !== "string"
    )
      return [];
    return [
      safeJson(pick(edge, ["kind", "from", "to", "role", "member", "order", "match", "phase"])),
    ];
  });
  return {
    contractVersion:
      typeof value.contractVersion === "number" && Number.isSafeInteger(value.contractVersion)
        ? value.contractVersion
        : GRAPH_VERSION,
    ...(typeof value.appId === "string" ? { appId: value.appId } : {}),
    nodes,
    edges,
  };
}

/**
 * Selects one declared collection from a public graph projection.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @param collection - Declared graph or runtime collection; arbitrary object paths are not accepted.
 * @returns Projected collection records, or undefined for an unavailable graph.
 */
export function graphItems(
  value: unknown,
  collection: GraphCollection | "env",
): JsonValue[] | undefined {
  const data = graphData(value);
  if (data === undefined) return undefined;
  if (collection === "descriptors") return data.nodes;
  return data.nodes.filter((node) => belongs(node, collection));
}

/**
 * Matches a projected node against the existing collection ownership rules.
 * @param node - Already projected public graph node.
 * @param collection - Declared graph or runtime collection; arbitrary object paths are not accepted.
 * @returns Whether the public node belongs to the declared collection.
 */
export function belongs(node: JsonValue, collection: string): boolean {
  if (!isRecord(node)) return false;
  if (collection === "routes")
    return node.kind === "trigger" && isRecord(node.config) && node.config.method !== undefined;
  if (collection === "env") return node.kind === "env";
  if (collection === "providers") return node.kind === "provider";
  return node.kind === (collection === "cache" ? "cache" : collection.slice(0, -1));
}

/**
 * Matches an already projected graph edge against one declaration identity.
 * @param edge - Already projected public graph edge.
 * @param id - Declaration or native record identifier selected by the caller.
 * @returns Whether either public endpoint matches the identifier.
 */
export function edgeTouches(edge: JsonValue, id: string): boolean {
  return isRecord(edge) && (edge.from === id || edge.to === id);
}
