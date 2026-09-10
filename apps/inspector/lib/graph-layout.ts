import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
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

const nodeWidth = 184;
const nodeHeight = 68;
export type GraphDirection = "RIGHT" | "DOWN";

export async function layoutGraph(
  graph: GraphSnapshot,
  direction: GraphDirection = "RIGHT",
): Promise<GraphLayout> {
  const sourceNodes = [...graph.nodes].sort((left, right) => left.id.localeCompare(right.id));
  const sourceEdges = [...graph.declaredEdges, ...graph.observedEdges].sort(compareEdges);
  const elk = new ELK(
    typeof Worker !== "undefined"
      ? {
          workerFactory: () =>
            new Worker(new URL("../node_modules/elkjs/lib/elk-worker.min.js", import.meta.url), {
              type: "module",
            }),
        }
      : {},
  );
  try {
    const result = await elk.layout({
      id: "relkit",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": direction,
        "elk.padding": "[top=24,left=24,bottom=24,right=24]",
        "elk.spacing.nodeNode": "32",
        "elk.layered.spacing.nodeNodeBetweenLayers": "72",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
      },
      children: sourceNodes.map((node) => ({ id: node.id, width: nodeWidth, height: nodeHeight })),
      edges: sourceEdges.map((edge, index) => ({
        id: edgeKey(edge, index),
        sources: [edge.from],
        targets: [edge.to],
      })),
    } satisfies ElkNode);
    const positions = new Map(
      (result.children ?? []).map((item) => [
        item.id,
        {
          x: item.x ?? 0,
          y: item.y ?? 0,
          width: item.width ?? nodeWidth,
          height: item.height ?? nodeHeight,
        },
      ]),
    );
    const nodes = sourceNodes.flatMap((node) => {
      const position = positions.get(node.id);
      return position === undefined ? [] : [{ node, ...position }];
    });
    const edges = sourceEdges.flatMap((edge, index) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      return from === undefined || to === undefined
        ? []
        : [
            {
              ...edge,
              key: edgeKey(edge, index),
              x1: direction === "DOWN" ? from.x + from.width / 2 : from.x + from.width,
              y1: direction === "DOWN" ? from.y + from.height : from.y + from.height / 2,
              x2: direction === "DOWN" ? to.x + to.width / 2 : to.x,
              y2: direction === "DOWN" ? to.y : to.y + to.height / 2,
            },
          ];
    });
    return {
      width: Math.max(720, result.width ?? 720),
      height: Math.max(180, result.height ?? 180),
      nodes,
      edges,
    };
  } finally {
    elk.terminateWorker();
  }
}

function edgeKey(edge: GraphEdge, index: number): string {
  return `${edge.relationship}:${edge.kind}:${edge.from}:${edge.to}:${index}`;
}

function compareEdges(left: GraphEdge, right: GraphEdge): number {
  return (
    left.from.localeCompare(right.from) ||
    left.to.localeCompare(right.to) ||
    left.kind.localeCompare(right.kind) ||
    left.relationship.localeCompare(right.relationship)
  );
}
