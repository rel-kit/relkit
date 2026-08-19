import type { GraphEdge, GraphNode, GraphSnapshot } from "./graph-model";

export interface PositionedNode {
  readonly node: GraphNode;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PositionedEdge extends GraphEdge {
  readonly key: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface GraphLayout {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly PositionedNode[];
  readonly edges: readonly PositionedEdge[];
}

/** Uses a sorted fixed grid so the fixture is repeatable and large graphs avoid force simulation. */
export function layoutGraph(graph: GraphSnapshot): GraphLayout {
  const nodeWidth = 168;
  const nodeHeight = 64;
  const padding = 24;
  const columnGap = 48;
  const rowGap = 28;
  const columns = Math.max(1, Math.ceil(Math.sqrt(graph.nodes.length)));
  const rows = Math.max(1, Math.ceil(graph.nodes.length / columns));
  const width = Math.max(720, padding * 2 + columns * nodeWidth + (columns - 1) * columnGap);
  const height = Math.max(180, padding * 2 + rows * nodeHeight + (rows - 1) * rowGap);
  const nodes = graph.nodes.map((node, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      node,
      x: padding + column * (nodeWidth + columnGap),
      y: padding + row * (nodeHeight + rowGap),
      width: nodeWidth,
      height: nodeHeight,
    };
  });
  const positions = new Map(nodes.map((position) => [position.node.id, position]));
  const edges = [...graph.declaredEdges, ...graph.observedEdges].flatMap((edge, index) => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (from === undefined || to === undefined) return [];
    return [
      {
        ...edge,
        key: `${edge.relationship}:${edge.kind}:${edge.from}:${edge.to}:${index}`,
        x1: from.x + from.width / 2,
        y1: from.y + from.height / 2,
        x2: to.x + to.width / 2,
        y2: to.y + to.height / 2,
      },
    ];
  });
  return { width, height, nodes, edges };
}
