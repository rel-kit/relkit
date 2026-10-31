"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  type Edge,
  type EdgeProps,
  getBezierPath,
} from "@xyflow/react";
import { Lock } from "lucide-react";
import type { EdgeGroup } from "../../lib/graph-semantics";

export interface RelationEdgeData extends Record<string, unknown> {
  readonly label: string;
  readonly group: EdgeGroup;
  /** Routed polyline from the layout engine, absolute canvas coordinates. */
  readonly points?: readonly { readonly x: number; readonly y: number }[];
  /** Label centre the layout reserved space for, absolute canvas coordinates. */
  readonly labelAt?: { readonly x: number; readonly y: number };
  /** Middleware the requests on this edge pass through, in order. */
  readonly guards?: readonly string[];
  readonly guardNote?: string;
  /** Adjacent to the selection or hovered. */
  readonly active: boolean;
  /** Something else is selected and this edge is not adjacent. */
  readonly dimmed: boolean;
  /** Always show the label, not only when active. */
  readonly labelled: boolean;
}

export type RelationEdge = Edge<RelationEdgeData, "link">;

export const EDGE_GROUPS: readonly EdgeGroup[] = [
  "structure",
  "invoke",
  "auth",
  "data",
  "event",
  "realtime",
  "ai",
  "platform",
];

export function markerId(group: EdgeGroup): string {
  return `explorer-arrow-${group}`;
}

/** Arrowheads coloured per edge family through CSS, referenced by id from each edge. */
export function EdgeMarkers() {
  return (
    <svg className="explorer-defs" aria-hidden="true" focusable="false">
      <defs>
        {EDGE_GROUPS.map((group) => (
          <marker
            key={group}
            id={markerId(group)}
            className={`explorer-arrow explorer-arrow--${group}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 1 1 L 9 5 L 1 9 z" />
          </marker>
        ))}
      </defs>
    </svg>
  );
}

export function RelationEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<RelationEdge>) {
  const routed = data?.points !== undefined && data.points.length >= 2 ? data.points : undefined;
  const [path, midX, midY] =
    routed === undefined
      ? getBezierPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition,
          targetPosition,
          curvature: 0.3,
        })
      : roundedPolyline(routed);
  const labelX = data?.labelAt?.x ?? midX;
  const labelY = data?.labelAt?.y ?? midY;
  const group = data?.group ?? "structure";
  const state = data?.active ? "active" : data?.dimmed ? "dimmed" : "default";
  const guards = data?.guards ?? [];
  const showLabel =
    data !== undefined && data.label !== "" && (data.labelled || data.active || guards.length > 0);
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        {...(markerEnd === undefined ? {} : { markerEnd })}
        className={`explorer-edge explorer-edge--${group}`}
        data-state={state}
        interactionWidth={16}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <span
            className={`explorer-edge-label explorer-edge-label--${group}`}
            data-state={state}
            data-guarded={guards.length > 0 ? "true" : undefined}
            title={guards.length > 0 ? data.guardNote : undefined}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {guards.length > 0 && (
              <span className="explorer-edge-label__lock">
                <Lock aria-hidden="true" />
                {guards.length > 1 && <span>{guards.length}</span>}
              </span>
            )}
            {data.label}
            {guards.length > 0 && <span className="sr-only">. {data.guardNote}</span>}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/** SVG path through the routed points with rounded corners, plus a label anchor at its middle. */
function roundedPolyline(
  points: readonly { readonly x: number; readonly y: number }[],
): [string, number, number] {
  const radius = 10;
  const first = points[0]!;
  let path = `M ${first.x} ${first.y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const corner = points[index]!;
    const next = points[index + 1]!;
    const into = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const out = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(radius, into / 2, out / 2);
    if (r <= 0.5) {
      path += ` L ${corner.x} ${corner.y}`;
      continue;
    }
    const inX = corner.x - ((corner.x - previous.x) / into) * r;
    const inY = corner.y - ((corner.y - previous.y) / into) * r;
    const outX = corner.x + ((next.x - corner.x) / out) * r;
    const outY = corner.y + ((next.y - corner.y) / out) * r;
    path += ` L ${inX} ${inY} Q ${corner.x} ${corner.y} ${outX} ${outY}`;
  }
  const last = points[points.length - 1]!;
  path += ` L ${last.x} ${last.y}`;
  const middle = points[Math.floor((points.length - 1) / 2)]!;
  const after = points[Math.min(points.length - 1, Math.floor((points.length - 1) / 2) + 1)]!;
  return [path, (middle.x + after.x) / 2, (middle.y + after.y) / 2];
}

export const explorerEdgeTypes = { link: RelationEdgeComponent };
