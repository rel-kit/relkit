/** Fixed stage layouts for the request flow: one row or one column per stage. */
import type { GraphView } from "./graph-views";
import { nodeSize, sizes, STAGE_HEADER_HEIGHT, STAGE_LABEL_WIDTH } from "./graph-view-layout-sizes";
import type {
  LayoutDirection,
  PlacedNode,
  PlacedStage,
  ViewLayout,
} from "./graph-view-layout.types";

const columnGap = 136;
const rowGap = 18;
const stageRowGap = 72;

export function layoutStages(view: GraphView, direction: LayoutDirection = "right"): ViewLayout {
  return direction === "down" ? layoutStageRows(view) : layoutStageColumns(view);
}

/** One row per stage, cards side by side and centred, a label at the start of each row. */
function layoutStageRows(view: GraphView): ViewLayout {
  const stages = view.stages ?? [];
  const rows = stages.map((stage) => ({
    stage,
    nodes: view.nodes.filter((node) => node.stage === stage.id),
  }));
  const widths = rows.map(({ nodes }) =>
    nodes.reduce((total, node, index) => total + nodeSize(node).width + (index > 0 ? 24 : 0), 0),
  );
  const widest = Math.max(sizes.item.width, ...widths);
  const placed: PlacedNode[] = [];
  const placedStages: PlacedStage[] = [];
  let y = 0;
  rows.forEach(({ stage, nodes }, index) => {
    const height = Math.max(sizes.response.height, ...nodes.map((node) => nodeSize(node).height));
    let x = STAGE_LABEL_WIDTH + Math.max(0, (widest - (widths[index] ?? 0)) / 2);
    for (const node of nodes) {
      const size = nodeSize(node);
      placed.push({ id: node.id, x, y: y + (height - size.height) / 2, ...size });
      x += size.width + 24;
    }
    placedStages.push({
      id: stage.id,
      label: stage.label,
      ...(stage.note === undefined ? {} : { note: stage.note }),
      x: 0,
      y,
      width: STAGE_LABEL_WIDTH - 20,
      height,
      orientation: "row",
    });
    y += height + stageRowGap;
  });
  return {
    width: STAGE_LABEL_WIDTH + widest,
    height: Math.max(0, y - stageRowGap),
    nodes: placed,
    stages: placedStages,
    routes: new Map(),
    labels: new Map(),
    direction: "down",
  };
}

/** One column per stage, cards stacked and centred, a header above each column. */
function layoutStageColumns(view: GraphView): ViewLayout {
  const stages = view.stages ?? [];
  const columns = stages.map((stage) => ({
    stage,
    nodes: view.nodes.filter((node) => node.stage === stage.id),
  }));
  const heights = columns.map(({ nodes }) =>
    nodes.reduce(
      (total, node, index) => total + nodeSize(node).height + (index > 0 ? rowGap : 0),
      0,
    ),
  );
  const tallest = Math.max(0, ...heights);
  const placed: PlacedNode[] = [];
  const placedStages: PlacedStage[] = [];
  let x = 0;
  columns.forEach(({ stage, nodes }, index) => {
    const width = Math.max(sizes.item.width, ...nodes.map((node) => nodeSize(node).width));
    let y = STAGE_HEADER_HEIGHT + Math.max(0, (tallest - (heights[index] ?? 0)) / 2);
    for (const node of nodes) {
      const size = nodeSize(node);
      placed.push({
        id: node.id,
        x: x + (width - size.width) / 2,
        y,
        width: size.width,
        height: size.height,
      });
      y += size.height + rowGap;
    }
    placedStages.push({
      id: stage.id,
      label: stage.label,
      ...(stage.note === undefined ? {} : { note: stage.note }),
      x,
      y: 0,
      width,
      height: STAGE_HEADER_HEIGHT - 10,
      orientation: "column",
    });
    x += width + columnGap;
  });
  return {
    width: Math.max(0, x - columnGap),
    height: STAGE_HEADER_HEIGHT + tallest,
    nodes: placed,
    stages: placedStages,
    routes: new Map(),
    labels: new Map(),
    direction: "right",
  };
}
