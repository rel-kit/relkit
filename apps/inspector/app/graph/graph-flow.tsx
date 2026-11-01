"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
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
import { layoutGraph, type GraphDirection, type GraphLayout } from "../../lib/graph-layout";
import type { GraphNode, GraphSnapshot } from "../../lib/graph-model";

type FlowNode = Node<{ node: GraphNode; label: ReactNode }>;

export function GraphFlow({
  graph,
  filtered,
  onSelect,
  direction = "RIGHT",
  ariaLabel = "Interactive capability graph",
}: {
  readonly graph: GraphSnapshot;
  readonly filtered: FilteredGraph;
  readonly onSelect: (node: GraphNode) => void;
  readonly direction?: GraphDirection;
  readonly ariaLabel?: string;
}) {
  const [layout, setLayout] = useState<GraphLayout>();
  const [layoutError, setLayoutError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setLayout(undefined);
    setLayoutError("");
    void layoutGraph(graph, direction).then(
      (next) => !cancelled && setLayout(next),
      (error) =>
        !cancelled && setLayoutError(error instanceof Error ? error.message : String(error)),
    );
    return () => {
      cancelled = true;
    };
  }, [direction, graph]);
  const positions = useMemo(
    () => new Map((layout?.nodes ?? []).map((item) => [item.node.id, item])),
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
                    <button
                      type="button"
                      className="flow-node-label"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(node);
                      }}
                    >
                      <small>{node.kind}</small>
                      <strong>{node.label ?? node.id}</strong>
                      {node.status === undefined ? null : <em>{node.status}</em>}
                    </button>
                  ),
                },
                ariaLabel: `${node.kind} ${node.id}`,
                className: `flow-node flow-node--${safeClass(node.kind)}${node.observed ? " flow-node--observed" : ""}`,
                focusable: false,
                style: {
                  width: position.width,
                  minHeight: position.height,
                  "--node-color": nodeToken(node.kind),
                  background: "color-mix(in oklch, var(--node-color) 12%, var(--panel))",
                  borderColor: "color-mix(in oklch, var(--node-color) 45%, var(--line))",
                  boxShadow: "none",
                } as CSSProperties,
              },
            ];
      }),
    [filtered.nodes, onSelect, positions],
  );
  const edges = useMemo<Edge[]>(
    () =>
      filtered.edges.map((edge, index) => ({
        id: `${edge.relationship}:${edge.kind}:${edge.from}:${edge.to}:${index}`,
        source: edge.from,
        target: edge.to,
        label: edge.kind,
        className: edgeClasses(edge.relationship, edge.kind),
        ariaLabel: `${edge.relationship} ${edge.kind} from ${edge.from} to ${edge.to}`,
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: edge.relationship === "observed",
      })),
    [filtered.edges],
  );
  if (layoutError !== "")
    return (
      <div className="react-flow-panel graph-layout-status" role="alert">
        {layoutError}
      </div>
    );
  if (layout === undefined)
    return (
      <div className="react-flow-panel graph-layout-status" role="status">
        Laying out graph…
      </div>
    );
  return (
    <div className="react-flow-panel" role="region" aria-label={ariaLabel}>
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
          nodeColor={(node) => nodeToken(String((node as FlowNode).data?.node?.kind ?? ""))}
          maskColor="color-mix(in oklch, var(--paper) 70%, transparent)"
          bgColor="var(--panel)"
          ariaLabel="Graph minimap"
        />
        <Controls showInteractive={false} />
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
      </ReactFlow>
    </div>
  );
}

/* Node colours come from the theme tokens so the canvas follows light and dark themes. */
const KIND_TOKENS: Readonly<Record<string, string>> = {
  "graph-start": "var(--success)",
  "graph-end": "var(--muted)",
  "graph-node": "var(--chart-2)",
  subgraph: "var(--chart-3)",
  agent: "var(--chart-4)",
  tool: "var(--chart-5)",
  function: "var(--chart-1)",
};
const CHART_TOKENS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function nodeToken(kind: string): string {
  const known = KIND_TOKENS[kind];
  if (known !== undefined) return known;
  let hash = 0;
  for (const character of kind) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return CHART_TOKENS[Math.abs(hash) % CHART_TOKENS.length]!;
}

function safeClass(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-");
}

function edgeClasses(relationship: string, kind: string): string {
  const route = safeClass(kind.split(":", 1)[0] ?? kind);
  return `flow-edge flow-edge--${relationship} flow-edge--${route}${kind.endsWith(":loop") ? " flow-edge--loop" : ""}`;
}
