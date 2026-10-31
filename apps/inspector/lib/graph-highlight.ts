/** Which cards and edges stay lit when a card is focused on the canvas. */
import type { GraphView } from "./graph-views";

export interface Highlight {
  readonly nodes: ReadonlySet<string>;
  readonly edges: ReadonlySet<string>;
}

/**
 * Lights the focused card, its direct callers, and, when `downstream` is set, everything its
 * arrows lead to: a route group reaches its service, the services that one calls, and the
 * database and auth behind them. Hover uses the one-step form so moving the pointer stays calm.
 */
export function highlightFor(view: GraphView, focusId: string, downstream: boolean): Highlight {
  const nodes = new Set<string>([focusId]);
  const edges = new Set<string>();
  const outgoing = new Map<string, (typeof view.edges)[number][]>();
  for (const edge of view.edges) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
    if (edge.to === focusId) {
      nodes.add(edge.from);
      edges.add(edge.id);
    }
  }
  const visited = new Set<string>([focusId]);
  const queue = [focusId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of outgoing.get(current) ?? []) {
      edges.add(edge.id);
      nodes.add(edge.to);
      if (downstream && !visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  // Keep containers and contents together: a lit card keeps its domain box lit, and a lit
  // domain box keeps its cards lit.
  const parentOf = new Map(view.nodes.map((node) => [node.id, node.parentId]));
  for (const id of [...nodes]) {
    const parent = parentOf.get(id);
    if (parent !== undefined) nodes.add(parent);
  }
  for (const node of view.nodes) if (node.parentId === focusId) nodes.add(node.id);
  return { nodes, edges };
}
