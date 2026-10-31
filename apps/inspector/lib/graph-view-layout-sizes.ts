/** Card, label and stage-header sizes the explorer layouts reserve. */
import type { ViewNode, ViewNodeType } from "./graph-views";

export const sizes: Readonly<
  Record<ViewNodeType, { readonly width: number; readonly height: number }>
> = {
  service: { width: 256, height: 108 },
  item: { width: 232, height: 68 },
  table: { width: 208, height: 60 },
  stub: { width: 208, height: 60 },
  response: { width: 208, height: 60 },
};

export const STAGE_HEADER_HEIGHT = 44;
export const STAGE_LABEL_WIDTH = 132;

/** Size the layout reserves for an edge label pill. */
export function labelSize(
  text: string,
  guards = 0,
): { readonly width: number; readonly height: number } {
  const lock = guards === 0 ? 0 : guards > 1 ? 26 : 18;
  return { width: Math.ceil(text.length * 6.4 + 22 + lock), height: 22 };
}

export function nodeSize(node: ViewNode): { readonly width: number; readonly height: number } {
  const base = sizes[node.type];
  if (node.type === "service" && node.counts !== undefined && node.counts.length > 0)
    return { width: base.width, height: base.height + 28 };
  if (node.badges !== undefined && node.badges.length > 0 && node.type !== "item")
    return { width: base.width, height: base.height + 4 };
  return base;
}
