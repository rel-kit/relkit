import { GRAPH_VERSION, type JsonValue } from "@relkit/contracts";
import {
  identity,
  isRecord,
  page,
  pick,
  safeJson,
  type ResolvedActiveGeneration,
} from "./shared.js";
import { projectDescriptors, projectNode, projectObservedEdges } from "./graph-utils.js";

export const GRAPH_COLLECTIONS = Object.freeze([
  "descriptors",
  "routes",
  "middlewares",
  "functions",
  "jobs",
  "events",
  "buckets",
  "cache",
  "tools",
  "agents",
  "errors",
  "services",
  "providers",
] as const);
export type GraphCollection = (typeof GRAPH_COLLECTIONS)[number];

export class InspectorGraphError extends Error {
  constructor(
    readonly code: "RELKIT_INSPECTOR_GRAPH_UNAVAILABLE" | "RELKIT_INSPECTOR_NOT_FOUND",
    readonly status: 404 | 503,
  ) {
    super(code);
    this.name = "InspectorGraphError";
  }
}

export async function graphSnapshot(generation: ResolvedActiveGeneration): Promise<JsonValue> {
  const data = graphData(generation.graph);
  if (data === undefined) throw new InspectorGraphError("RELKIT_INSPECTOR_GRAPH_UNAVAILABLE", 503);
  const observedEdges = projectObservedEdges(generation.observedEdges);
  return {
    ...identity(generation),
    graph: { ...data, ...(observedEdges.length === 0 ? {} : { observedEdges }) },
    ...data,
    ...(observedEdges.length === 0 ? {} : { observedEdges }),
  } as JsonValue;
}

export async function graphList(
  generation: ResolvedActiveGeneration,
  collection: GraphCollection,
  request: Request,
): Promise<JsonValue> {
  const items =
    collection === "descriptors" && generation.descriptors !== undefined
      ? projectDescriptors(generation.descriptors)
      : graphItems(generation.graph, collection);
  if (items === undefined) throw new InspectorGraphError("RELKIT_INSPECTOR_GRAPH_UNAVAILABLE", 503);
  return { ...identity(generation), ...page(items, request) } as JsonValue;
}

export function graphDetail(
  generation: ResolvedActiveGeneration,
  collection: GraphCollection,
  id: string,
): JsonValue {
  const items =
    collection === "descriptors" && generation.descriptors !== undefined
      ? projectDescriptors(generation.descriptors)
      : graphItems(generation.graph, collection);
  const item = items?.find((value) => isRecord(value) && value.id === id);
  if (item === undefined) throw new InspectorGraphError("RELKIT_INSPECTOR_NOT_FOUND", 404);
  const data = graphData(generation.graph);
  const declaredEdges = data?.edges.filter((edge) => edgeTouches(edge, id));
  const observedEdges = projectObservedEdges(generation.observedEdges).filter((edge) =>
    edgeTouches(edge, id),
  );
  return {
    ...identity(generation),
    descriptor: item,
    node: item,
    ...(declaredEdges === undefined ? {} : { declaredEdges }),
    ...(observedEdges.length === 0 ? {} : { observedEdges }),
  } as JsonValue;
}

export function sourceDetail(generation: ResolvedActiveGeneration, id: string): JsonValue {
  const node = graphItems(generation.graph, "descriptors")?.find(
    (value) => isRecord(value) && value.id === id,
  );
  if (!isRecord(node) || node.source === undefined)
    throw new InspectorGraphError("RELKIT_INSPECTOR_NOT_FOUND", 404);
  return { ...identity(generation), id, source: node.source } as JsonValue;
}

function graphData(
  value: unknown,
): { contractVersion: number; appId?: string; nodes: JsonValue[]; edges: JsonValue[] } | undefined {
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

function graphItems(value: unknown, collection: GraphCollection | "env"): JsonValue[] | undefined {
  const data = graphData(value);
  if (data === undefined) return undefined;
  if (collection === "descriptors") return data.nodes;
  return data.nodes.filter((node) => belongs(node, collection));
}

function belongs(node: JsonValue, collection: string): boolean {
  if (!isRecord(node)) return false;
  if (collection === "routes")
    return node.kind === "trigger" && isRecord(node.config) && node.config.method !== undefined;
  if (collection === "env") return node.kind === "env";
  if (collection === "providers") return node.kind === "provider";
  return node.kind === (collection === "cache" ? "cache" : collection.slice(0, -1));
}

function edgeTouches(edge: JsonValue, id: string): boolean {
  return isRecord(edge) && (edge.from === id || edge.to === id);
}
