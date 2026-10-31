/** Builds the React Flow cards for a laid-out view and picks the card sides each edge uses. */
import type { LayoutDirection, ViewLayout } from "../../lib/graph-view-layout";
import type { GraphView } from "../../lib/graph-views";
import { NODE_CATEGORIES } from "../../lib/graph-semantics";
import type { ExplorerNode, StageNode } from "./graph-nodes";

export type CanvasNode = ExplorerNode | StageNode;

/** Stage headers first, then every placed view node; a node with children becomes a group. */
export function canvasNodes(
  layout: ViewLayout | undefined,
  viewNodes: GraphView["nodes"],
  positions: ReadonlyMap<string, ViewLayout["nodes"][number]>,
  selectedId: string | undefined,
  neighbours: ReadonlySet<string> | undefined,
): CanvasNode[] {
  if (layout === undefined) return [];
  const list: CanvasNode[] = [];
  for (const stage of layout.stages) {
    list.push({
      id: `stage:${stage.id}`,
      type: "stage",
      position: { x: stage.x, y: stage.y },
      data: {
        label: stage.label,
        orientation: stage.orientation,
        ...(stage.note === undefined ? {} : { note: stage.note }),
      },
      width: stage.width,
      height: stage.height,
      selectable: false,
      draggable: false,
      focusable: false,
    });
  }
  for (const node of viewNodes) {
    const placed = positions.get(node.id);
    if (placed === undefined) continue;
    const isGroup = viewNodes.some((child) => child.parentId === node.id);
    list.push({
      id: node.id,
      type: isGroup ? "group" : node.type,
      position: { x: placed.x, y: placed.y },
      width: placed.width,
      height: placed.height,
      data: {
        view: node,
        selected: node.id === selectedId,
        dimmed: neighbours !== undefined && !neighbours.has(node.id),
      },
      ...(node.parentId === undefined
        ? {}
        : { parentId: node.parentId, extent: "parent" as const }),
      draggable: false,
      selectable: true,
      ariaLabel: `${NODE_CATEGORIES[node.category].label} ${node.title}`,
      className: `explorer-node explorer-node--${node.type}`,
      ...(isGroup ? { zIndex: -1 } : {}),
    });
  }
  return list;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Chooses which card sides an edge leaves and enters: along the reading direction when the target
 * is ahead, against it when the target is behind, and sideways for cards in the same layer.
 */
export function pickHandles(
  direction: LayoutDirection,
  from: Box | undefined,
  to: Box | undefined,
  fromSide = false,
  toSide = false,
): { readonly source: string; readonly target: string } {
  const forwardRight = { source: "right", target: "left" };
  const backwardRight = { source: "left-out", target: "right-in" };
  const forwardDown = { source: "down", target: "top" };
  const backwardDown = { source: "up", target: "bottom" };
  // Into the side column: sideways when it stands to the right, downwards when it lies beneath.
  if (toSide && !fromSide) return direction === "down" ? forwardRight : forwardDown;
  // Within the side column (auth to database): along the column.
  if (toSide && fromSide) return direction === "down" ? forwardDown : forwardRight;
  if (from === undefined || to === undefined)
    return direction === "down" ? forwardDown : forwardRight;
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  if (direction === "down") {
    if (Math.abs(dy) > Math.min(from.height, to.height) / 2)
      return dy > 0 ? forwardDown : backwardDown;
    return dx >= 0 ? forwardRight : backwardRight;
  }
  if (Math.abs(dx) > Math.min(from.width, to.width) / 2)
    return dx > 0 ? forwardRight : backwardRight;
  return dy >= 0 ? forwardDown : backwardDown;
}
