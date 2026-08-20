import type { GraphEdge, GraphNode, GraphSnapshot } from "./graph-model";

export interface FilteredGraph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

export function filterGraph(graph: GraphSnapshot, search: string, kind: string): FilteredGraph {
  const query = search.trim().toLowerCase();
  const nodes = graph.nodes.filter(
    (node) =>
      (kind === "all" || node.kind === kind) &&
      (query === "" || `${node.kind} ${node.id}`.toLowerCase().includes(query)),
  );
  const visible = new Set(nodes.map((node) => node.id));
  const edges = [...graph.declaredEdges, ...graph.observedEdges].filter(
    (edge) => visible.has(edge.from) && visible.has(edge.to),
  );
  return { nodes, edges };
}

export function graphKinds(graph: GraphSnapshot): readonly string[] {
  return [...new Set(graph.nodes.map((node) => node.kind))].sort((a, b) => a.localeCompare(b));
}
