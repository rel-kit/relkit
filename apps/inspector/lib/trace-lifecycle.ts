import type { InspectorObject } from "./api-types";

/** Presentation nodes keep request/phase IDs separate from real span IDs. */
export function traceLifecycle(
  spans: readonly InspectorObject[],
  _requests: readonly InspectorObject[] = [],
): readonly InspectorObject[] {
  const merged = new Map<string, InspectorObject>();
  for (const span of spans) {
    const id = text(span.spanId);
    if (!id) continue;
    const previous = merged.get(id);
    const complete = previous?.completedAt && !span.completedAt;
    merged.set(id, complete ? { ...span, ...previous } : { ...previous, ...span });
  }
  const nodes: InspectorObject[] = [...merged.values()].map((span) => ({
    ...span,
    nodeId: span.spanId,
    nodeParentId: span.parentSpanId,
    recordType: "span",
  }));
  return nodes;
}

export function traceDuration(value: InspectorObject): number | undefined {
  if (typeof value.durationMs === "number" && Number.isFinite(value.durationMs))
    return Math.max(0, value.durationMs);
  const start = Date.parse(text(value.startedAt));
  const end = Date.parse(text(value.completedAt));
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : undefined;
}

export function orderTraceNodes(nodes: readonly InspectorObject[]): readonly InspectorObject[] {
  const byId = new Map(nodes.map((node) => [text(node.nodeId), node]));
  const children = new Map<string, InspectorObject[]>();
  for (const node of nodes) {
    const parent = text(node.nodeParentId);
    const key = byId.has(parent) ? parent : "";
    children.set(key, [...(children.get(key) ?? []), node]);
  }
  const ordered: InspectorObject[] = [];
  const seen = new Set<string>();
  const visit = (node: InspectorObject, depth: number) => {
    const id = text(node.nodeId);
    if (seen.has(id)) return;
    seen.add(id);
    ordered.push({ ...node, depth: Math.min(depth, 8) });
    for (const child of children.get(id) ?? []) visit(child, depth + 1);
  };
  for (const list of children.values())
    list.sort(
      (left, right) =>
        (Date.parse(text(left.startedAt)) || 0) - (Date.parse(text(right.startedAt)) || 0),
    );
  for (const node of children.get("") ?? []) visit(node, 0);
  for (const node of nodes) visit(node, 0); // Malformed cycles still render once.
  return ordered;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
