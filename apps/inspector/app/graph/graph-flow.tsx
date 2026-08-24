"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import type { FilteredGraph } from "../../lib/graph-filter";
import { layoutGraph } from "../../lib/graph-layout";
import { graphKindColor, type GraphNode, type GraphSnapshot } from "../../lib/graph-model";

type FlowNode = Node<{ node: GraphNode; label: ReactNode }>;

export function GraphFlow({
  graph,
  filtered,
  onSelect,
}: {
  readonly graph: GraphSnapshot;
  readonly filtered: FilteredGraph;
  readonly onSelect: (node: GraphNode) => void;
}) {
  const layout = useMemo(() => layoutGraph(graph), [graph]);
  const positions = useMemo(
    () => new Map(layout.nodes.map((item) => [item.node.id, item])),
    [layout],
  );
  const nodes = useMemo<FlowNode[]>(
    () =>
      filtered.nodes.flatMap((node) => {
        const position = positions.get(node.id);
        return position === undefined
          ? []
          : [
              {
                id: node.id,
                position: { x: position.x, y: position.y },
                data: {
                  node,
                  label: (
                    <span className="flow-node-label">
                      <small>{node.kind}</small>
                      <strong>{node.id}</strong>
                    </span>
                  ),
                },
                ariaLabel: `${node.kind} ${node.id}`,
                className: `flow-node flow-node--${safeClass(node.kind)}`,
                style: {
                  width: position.width,
                  minHeight: position.height,
                  "--node-color": graphKindColor(node.kind),
                } as CSSProperties,
              },
            ];
      }),
    [filtered.nodes, positions],
  );
  const edges = useMemo<Edge[]>(
    () =>
      filtered.edges.map((edge, index) => ({
        id: `${edge.relationship}:${edge.kind}:${edge.from}:${edge.to}:${index}`,
        source: edge.from,
        target: edge.to,
        label: edge.kind,
        className: `flow-edge flow-edge--${edge.relationship}`,
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: edge.relationship === "observed",
      })),
    [filtered.edges],
  );
  return (
    <div className="react-flow-panel" role="region" aria-label="Interactive capability graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        minZoom={0.2}
        maxZoom={2.5}
        nodesDraggable={false}
        onNodeClick={(_event, node) => onSelect(node.data.node)}
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => graphKindColor(String(node.data?.node?.kind ?? ""))}
          ariaLabel="Graph minimap"
        />
        <Controls showInteractive={false} />
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
      </ReactFlow>
    </div>
  );
}

function safeClass(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-");
}
