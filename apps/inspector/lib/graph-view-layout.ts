/** Positions explorer views: ELK compound layout for cards and domains, fixed stages for flows. */
import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import { createElk } from "./graph-layout";
import { type GraphView, labelEdge, type ViewNode } from "./graph-views";
import { labelSize, nodeSize, sizes } from "./graph-view-layout-sizes";
import { layoutStages } from "./graph-view-layout-stages";
import type { LayoutDirection, PlacedNode, Point, ViewLayout } from "./graph-view-layout.types";

export type {
  LayoutDirection,
  PlacedNode,
  PlacedStage,
  Point,
  ViewLayout,
} from "./graph-view-layout.types";
export {
  labelSize,
  nodeSize,
  STAGE_HEADER_HEIGHT,
  STAGE_LABEL_WIDTH,
} from "./graph-view-layout-sizes";
export { layoutStages } from "./graph-view-layout-stages";

const groupPadding = { top: 60, right: 28, bottom: 24, left: 28 };

export async function layoutView(
  view: GraphView,
  direction: LayoutDirection = "down",
): Promise<ViewLayout> {
  return view.mode === "flow" ? layoutStages(view, direction) : layoutCompound(view, direction);
}

/** ELK layered layout with compound children kept inside their parent. */
export async function layoutCompound(
  view: GraphView,
  direction: LayoutDirection = "down",
): Promise<ViewLayout> {
  const elkDirection = direction === "down" ? "DOWN" : "RIGHT";
  const { elk, usesWorker } = createElk();
  // Shared platform services sit in their own column beside the hierarchy (see placeSide).
  const side = view.nodes.filter((node) => node.side === true && node.parentId === undefined);
  const sideIds = new Set(side.map((node) => node.id));
  const byParent = new Map<string | undefined, ViewNode[]>();
  for (const node of view.nodes) {
    if (sideIds.has(node.id)) continue;
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }
  const children = (parentId: string | undefined): ElkNode[] =>
    (byParent.get(parentId) ?? []).map((node) => {
      const size = nodeSize(node);
      const nested = children(node.id);
      const rank =
        node.rank === undefined
          ? {}
          : {
              layoutOptions: {
                "elk.layered.layering.layerConstraint": node.rank === "first" ? "FIRST" : "LAST",
              },
            };
      return nested.length === 0
        ? { id: node.id, width: size.width, height: size.height, ...rank }
        : {
            id: node.id,
            children: nested,
            layoutOptions: {
              "elk.algorithm": "layered",
              "elk.direction": elkDirection,
              "elk.padding": `[top=${groupPadding.top},left=${groupPadding.left},bottom=${groupPadding.bottom},right=${groupPadding.right}]`,
              "elk.spacing.nodeNode": "20",
              "elk.layered.spacing.nodeNodeBetweenLayers": "88",
              "elk.layered.spacing.edgeNodeBetweenLayers": "24",
            },
          };
    });
  const down = direction === "down";
  const result: ElkNode = await elk
    .layout({
      id: "relkit-view",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": elkDirection,
        "elk.hierarchyHandling": "INCLUDE_CHILDREN",
        // Report every edge and label in root coordinates, whichever box the edge runs inside.
        "elk.json.edgeCoords": "ROOT",
        "elk.padding": "[top=16,left=16,bottom=16,right=16]",
        "elk.spacing.nodeNode": down ? "48" : "40",
        "elk.layered.spacing.nodeNodeBetweenLayers": down ? "88" : "120",
        "elk.spacing.edgeLabel": "6",
        "elk.spacing.labelNode": "10",
        "elk.edgeLabels.inline": "false",
        "elk.layered.spacing.edgeNodeBetweenLayers": "32",
        "elk.layered.crossingMinimization.semiInteractive": "true",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.spacing.edgeNode": "28",
        "elk.spacing.edgeEdge": "16",
        "elk.layered.spacing.edgeEdgeBetweenLayers": "16",
      },
      children: children(undefined),
      edges: view.edges
        .filter((edge) => edge.from !== edge.to && !sideIds.has(edge.from) && !sideIds.has(edge.to))
        .map((edge) => ({
          id: edge.id,
          sources: [edge.from],
          targets: [edge.to],
          ...(labelEdge(view, edge)
            ? {
                labels: [
                  {
                    id: `${edge.id}:label`,
                    text: edge.label,
                    ...labelSize(edge.label, edge.guards?.length ?? 0),
                    layoutOptions: { "elk.edgeLabels.placement": "CENTER" },
                  },
                ],
              }
            : {}),
        })),
    } satisfies ElkNode)
    .finally(() => {
      if (usesWorker) elk.terminateWorker();
    });
  const placed: PlacedNode[] = [];
  const absolute = new Map<string, Point>([["relkit-view", { x: 0, y: 0 }]]);
  const routes = new Map<string, readonly Point[]>();
  const labels = new Map<string, Point>();
  const visit = (container: ElkNode, origin: Point, parentId?: string) => {
    for (const item of container.children ?? []) {
      const position = { x: item.x ?? 0, y: item.y ?? 0 };
      absolute.set(item.id, { x: origin.x + position.x, y: origin.y + position.y });
      placed.push({
        id: item.id,
        ...position,
        width: item.width ?? sizes.item.width,
        height: item.height ?? sizes.item.height,
        ...(parentId === undefined ? {} : { parentId }),
      });
      visit(item, absolute.get(item.id)!, item.id);
    }
    // Edge coordinates are relative to the node that contains the edge.
    for (const edge of container.edges ?? []) {
      const section = edge.sections?.[0];
      if (section === undefined) continue;
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(
        (point) => ({ x: origin.x + point.x, y: origin.y + point.y }),
      );
      routes.set(edge.id, points);
      const label = edge.labels?.[0];
      if (label?.x !== undefined && label.y !== undefined)
        labels.set(edge.id, {
          x: origin.x + label.x + (label.width ?? 0) / 2,
          y: origin.y + label.y + (label.height ?? 0) / 2,
        });
    }
  };
  visit(result, { x: 0, y: 0 });
  const bounds = placeSide(side, placed, result.width ?? 0, result.height ?? 0, direction);
  return {
    width: bounds.width,
    height: bounds.height,
    nodes: placed,
    stages: [],
    routes,
    labels,
    direction,
  };
}

const sideGap = 160;
const sideSpacing = 56;

/**
 * Places shared platform cards beside the laid-out hierarchy: a column to the right when the
 * graph reads top to bottom, a row underneath when it reads left to right. The cards keep their
 * order (auth before the database) and are centred on the hierarchy.
 */
function placeSide(
  side: readonly ViewNode[],
  placed: PlacedNode[],
  width: number,
  height: number,
  direction: LayoutDirection,
): { readonly width: number; readonly height: number } {
  if (side.length === 0) return { width, height };
  const sizes = side.map((node) => nodeSize(node));
  if (direction === "down") {
    const total = sizes.reduce(
      (sum, size, index) => sum + size.height + (index > 0 ? sideSpacing : 0),
      0,
    );
    const columnWidth = Math.max(...sizes.map((size) => size.width));
    const x = width + sideGap;
    let y = Math.max(16, (height - total) / 2);
    side.forEach((node, index) => {
      const size = sizes[index]!;
      placed.push({ id: node.id, x: x + (columnWidth - size.width) / 2, y, ...size });
      y += size.height + sideSpacing;
    });
    return { width: x + columnWidth + 16, height: Math.max(height, y - sideSpacing + 16) };
  }
  const total = sizes.reduce(
    (sum, size, index) => sum + size.width + (index > 0 ? sideSpacing : 0),
    0,
  );
  const rowHeight = Math.max(...sizes.map((size) => size.height));
  const y = height + sideGap;
  let x = Math.max(16, (width - total) / 2);
  side.forEach((node, index) => {
    const size = sizes[index]!;
    placed.push({ id: node.id, x, y: y + (rowHeight - size.height) / 2, ...size });
    x += size.width + sideSpacing;
  });
  return { width: Math.max(width, x - sideSpacing + 16), height: y + rowHeight + 16 };
}
