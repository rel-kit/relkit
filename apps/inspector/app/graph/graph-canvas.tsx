"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  PanOnScrollMode,
  Panel,
  ReactFlow,
  type ReactFlowInstance,
  ReactFlowProvider,
} from "@xyflow/react";
import type { LayoutDirection, ViewLayout } from "../../lib/graph-view-layout";
import { type GraphView, labelEdge } from "../../lib/graph-views";
import { highlightFor } from "../../lib/graph-highlight";
import { EdgeMarkers, explorerEdgeTypes, markerId, type RelationEdge } from "./graph-edges";
import { explorerNodeTypes } from "./graph-nodes";
import { type CanvasNode, canvasNodes, pickHandles } from "./graph-canvas-elements";

export function GraphCanvas({
  view,
  layout,
  selectedId,
  onSelect,
  onOpen,
  status,
  layoutKey,
  refitKey,
  toolbar,
}: {
  readonly view: GraphView;
  readonly layout: ViewLayout | undefined;
  readonly selectedId: string | undefined;
  readonly onSelect: (id: string | undefined) => void;
  readonly onOpen: (id: string) => void;
  readonly status?: string;
  /** Changes whenever a new layout arrives; remounts the flow so it fits the new view. */
  readonly layoutKey: number;
  /** Changes when the canvas is resized by opening or closing a side panel. */
  readonly refitKey?: string;
  /** Controls floated at the top of the canvas. */
  readonly toolbar?: ReactNode;
}) {
  const [hoveredId, setHoveredId] = useState<string>();
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<ReactFlowInstance<CanvasNode, RelationEdge> | null>(null);
  const firstFit = useRef(true);
  useEffect(() => {
    if (firstFit.current) {
      firstFit.current = false;
      return;
    }
    // Wait for the grid to settle on its new column widths before fitting.
    const timer = window.setTimeout(() => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      void instance.current?.fitView({ padding: 0.1, maxZoom: 1, duration: reduce ? 0 : 200 });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [refitKey]);
  const focusId = selectedId ?? hoveredId;
  // A selection follows the whole path downstream; a hover only lights direct neighbours.
  // A focus that is not drawn in this view (the domain itself, inside its own domain view)
  // highlights nothing rather than dimming every card.
  const highlight = useMemo(
    () =>
      focusId === undefined || !view.nodes.some((node) => node.id === focusId)
        ? undefined
        : highlightFor(view, focusId, selectedId !== undefined && focusId === selectedId),
    [focusId, selectedId, view],
  );
  const neighbours = highlight?.nodes;

  const positions = useMemo(
    () => new Map((layout?.nodes ?? []).map((node) => [node.id, node])),
    [layout],
  );

  const nodes = useMemo<CanvasNode[]>(
    () => canvasNodes(layout, view.nodes, positions, selectedId, neighbours),
    [layout, neighbours, positions, selectedId, view.nodes],
  );

  const absolute = useMemo(() => {
    const map = new Map<string, { x: number; y: number; width: number; height: number }>();
    for (const node of layout?.nodes ?? []) {
      const parent = node.parentId === undefined ? undefined : positions.get(node.parentId);
      map.set(node.id, {
        x: node.x + (parent?.x ?? 0),
        y: node.y + (parent?.y ?? 0),
        width: node.width,
        height: node.height,
      });
    }
    return map;
  }, [layout, positions]);
  const direction: LayoutDirection = layout?.direction ?? "down";
  const sideIds = useMemo(
    () => new Set(view.nodes.filter((node) => node.side).map((node) => node.id)),
    [view.nodes],
  );
  const edges = useMemo<RelationEdge[]>(
    () =>
      view.edges.map((edge) => {
        const active = highlight !== undefined && highlight.edges.has(edge.id);
        const handles = pickHandles(
          direction,
          absolute.get(edge.from),
          absolute.get(edge.to),
          sideIds.has(edge.from),
          sideIds.has(edge.to),
        );
        const points = layout?.routes.get(edge.id);
        const labelAt = layout?.labels.get(edge.id);
        return {
          id: edge.id,
          type: "link",
          source: edge.from,
          target: edge.to,
          sourceHandle: handles.source,
          targetHandle: handles.target,
          markerEnd: markerId(edge.group),
          ariaLabel: `${edge.from} ${edge.label} ${edge.to}`,
          data: {
            label: edge.label,
            group: edge.group,
            ...(points === undefined ? {} : { points }),
            ...(labelAt === undefined ? {} : { labelAt }),
            ...(edge.guards === undefined ? {} : { guards: edge.guards }),
            ...(edge.guardNote === undefined ? {} : { guardNote: edge.guardNote }),
            active,
            dimmed: highlight !== undefined && !active,
            labelled: labelEdge(view, edge),
          },
        };
      }),
    [absolute, direction, focusId, highlight, layout, sideIds, view],
  );

  return (
    <div
      ref={container}
      className="explorer-canvas"
      role="region"
      aria-label="Interactive capability graph"
    >
      <EdgeMarkers />
      {status !== undefined && (
        <div className="explorer-canvas__status" role="status">
          {status}
        </div>
      )}
      <ReactFlowProvider key={layoutKey}>
        <ReactFlow<CanvasNode, RelationEdge>
          nodes={nodes}
          edges={edges}
          fitView={!(view.mode === "flow" && direction === "right")}
          fitViewOptions={{ padding: 0.1, maxZoom: 1 }}
          onInit={(flow) => {
            instance.current = flow;
            // A left-to-right request flow is wide: start at the request, legible, and let the
            // reader pan instead of shrinking eight stages into the viewport.
            if (view.mode !== "flow" || direction !== "right") return;
            if (layout === undefined || container.current === null) return;
            const { clientWidth, clientHeight } = container.current;
            const fit = Math.min(
              (clientWidth - 48) / layout.width,
              (clientHeight - 48) / layout.height,
            );
            const zoom = Math.max(0.62, Math.min(1, fit));
            void flow.setViewport({
              x: 24,
              y: Math.max(24, (clientHeight - layout.height * zoom) / 2),
              zoom,
            });
          }}
          nodeTypes={explorerNodeTypes}
          edgeTypes={explorerEdgeTypes}
          minZoom={0.15}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          panOnScroll
          panOnScrollMode={PanOnScrollMode.Free}
          zoomOnScroll={false}
          zoomOnPinch
          zoomOnDoubleClick={false}
          elementsSelectable
          selectNodesOnDrag={false}
          onNodeClick={(_event, node) => {
            if (node.type === "stage") return;
            onSelect(node.id);
          }}
          onNodeDoubleClick={(_event, node) => {
            if (node.type !== "stage") onOpen(node.id);
          }}
          onNodeMouseEnter={(_event, node) => node.type !== "stage" && setHoveredId(node.id)}
          onNodeMouseLeave={() => setHoveredId(undefined)}
          onPaneClick={() => onSelect(undefined)}
          proOptions={{ hideAttribution: true }}
        >
          {toolbar !== undefined && <Panel position="top-center">{toolbar}</Panel>}
          <Controls showInteractive={false} />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
