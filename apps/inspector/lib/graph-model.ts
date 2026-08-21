import { INSPECTOR_API_PROTOCOL, INSPECTOR_API_VERSION, type InspectorGraph } from "./api-types";

export type GraphRelationship = "declared" | "observed";

export interface GraphNode {
  readonly id: string;
  readonly kind: string;
}

export interface GraphEdge {
  readonly relationship: GraphRelationship;
  readonly kind: string;
  readonly from: string;
  readonly to: string;
  readonly role?: string;
  readonly member?: string;
  readonly order?: number;
}

export interface GraphSnapshot {
  readonly generationId: string;
  readonly graphHash: string;
  readonly appId?: string;
  readonly nodes: readonly GraphNode[];
  readonly declaredEdges: readonly GraphEdge[];
  readonly observedEdges: readonly GraphEdge[];
}

export interface GraphSummary {
  readonly appId?: string;
  readonly nodeCount: number;
  readonly declaredEdgeCount: number;
  readonly observedEdgeCount: number;
}

export class GraphDataError extends Error {
  constructor() {
    super("Inspector graph data is unavailable");
    this.name = "GraphDataError";
  }
}

export function normalizeGraphResponse(payload: InspectorGraph): GraphSnapshot {
  const root = record(payload);
  const graph = record(root?.graph) ?? root;
  const generationId = text(root?.generationId);
  const graphHash = text(root?.graphHash);
  if (
    root?.protocol !== INSPECTOR_API_PROTOCOL ||
    root?.version !== INSPECTOR_API_VERSION ||
    generationId === undefined ||
    graphHash === undefined ||
    graph === undefined ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges)
  )
    throw new GraphDataError();

  const appId = text(graph.appId);
  const observed = root.observedEdges ?? graph.observedEdges;
  return {
    generationId,
    graphHash,
    ...(appId === undefined ? {} : { appId }),
    nodes: readNodes(graph.nodes),
    declaredEdges: readEdges(graph.edges, "declared"),
    observedEdges: readEdges(observed, "observed"),
  };
}

export function summarizeGraph(graph: GraphSnapshot): GraphSummary {
  return {
    ...(graph.appId === undefined ? {} : { appId: graph.appId }),
    nodeCount: graph.nodes.length,
    declaredEdgeCount: graph.declaredEdges.length,
    observedEdgeCount: graph.observedEdges.length,
  };
}

export function edgeLabel(edge: GraphEdge): string {
  return edge.kind.replace(/[._-]+/g, " ");
}

function readNodes(value: readonly unknown[]): readonly GraphNode[] {
  return value
    .flatMap((item) => {
      const node = record(item);
      const id = text(node?.id);
      const kind = text(node?.kind);
      return id === undefined || kind === undefined ? [] : [{ id, kind }];
    })
    .sort(compareNodes);
}

function readEdges(value: unknown, relationship: GraphRelationship): readonly GraphEdge[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => {
      const edge = record(item);
      const from = text(edge?.from);
      const to = text(edge?.to);
      const kind = text(edge?.kind) ?? text(edge?.relationship);
      if (from === undefined || to === undefined || kind === undefined) return [];
      const role = text(edge?.role);
      const member = text(edge?.member);
      const order = typeof edge?.order === "number" ? edge.order : undefined;
      return [
        {
          relationship,
          kind,
          from,
          to,
          ...(role === undefined ? {} : { role }),
          ...(member === undefined ? {} : { member }),
          ...(order === undefined ? {} : { order }),
        },
      ];
    })
    .sort(compareEdges);
}

function compareNodes(left: GraphNode, right: GraphNode): number {
  return compareText(left.kind, right.kind) || compareText(left.id, right.id);
}

function compareEdges(left: GraphEdge, right: GraphEdge): number {
  return (
    compareText(left.relationship, right.relationship) ||
    compareText(left.kind, right.kind) ||
    compareText(left.from, right.from) ||
    compareNumber(left.order, right.order) ||
    compareText(left.to, right.to) ||
    compareText(left.role ?? "", right.role ?? "")
  );
}

function compareNumber(left: number | undefined, right: number | undefined): number {
  return (left ?? Number.MAX_SAFE_INTEGER) - (right ?? Number.MAX_SAFE_INTEGER);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
