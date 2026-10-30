/** Edge helpers shared by the explorer views: labels, guard notes and view-edge builders. */
import type { GraphEdge } from "./graph-model";
import type { AppHierarchy } from "./graph-hierarchy";
import { nodeTitle } from "./graph-node-meta";
import { type EdgeGroup, edgeGroup, edgeVerb } from "./graph-semantics";
import type { GraphView, ViewEdge } from "./graph-views.types";

export const groupPriority: readonly EdgeGroup[] = [
  "invoke",
  "auth",
  "data",
  "event",
  "realtime",
  "ai",
  "structure",
  "platform",
];

export const groupNoun: Readonly<Record<EdgeGroup, readonly [string, string]>> = {
  invoke: ["call", "calls"],
  auth: ["guarded route", "guarded routes"],
  data: ["table access", "table accesses"],
  event: ["event", "events"],
  realtime: ["channel push", "channel pushes"],
  ai: ["agent link", "agent links"],
  structure: ["dependency", "dependencies"],
  platform: ["provider", "providers"],
};

export function mapEdgeLabel(
  hierarchy: AppHierarchy,
  from: string,
  to: string,
  all: readonly GraphEdge[],
  groups: ReadonlyMap<EdgeGroup, readonly GraphEdge[]>,
): string {
  const plural = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
  const fromKind = hierarchy.nodes.get(from)?.kind;
  const toKind = hierarchy.nodes.get(to)?.kind;
  if (all.every((edge) => edge.kind === "checks-session"))
    return plural(all.length, "session check", "session checks");
  if (all.every((edge) => edge.kind === "declares")) return "declares";
  if (fromKind === "route-group") return plural(all.length, "route", "routes");
  if (toKind === "event") return "publishes";
  if (fromKind === "event") return "wakes";
  if (toKind === "channel") return "pushes";
  if (toKind === "agent") return "asks";
  if (toKind === "tool") return "uses";
  if (fromKind === "tool") return "runs";
  const parts = groupPriority.flatMap((group) => {
    const list = groups.get(group);
    if (list === undefined || group === "structure") return [];
    const [one, many] = groupNoun[group];
    return [plural(list.length, one, many)];
  });
  return parts.length > 0 ? parts.join(" · ") : "depends on";
}

/** Display names of middleware, in the order they run. */
export function guardNames(hierarchy: AppHierarchy, ids: readonly string[]): readonly string[] {
  return ids.map((id) => {
    const node = hierarchy.nodes.get(id);
    return node === undefined ? id : nodeTitle(node);
  });
}

export function guardSentence(names: readonly string[], guarded: number, total: number): string {
  const chain = names.join(" → ");
  if (total <= 1) return `Passes through ${chain}`;
  return guarded === total
    ? `All ${total} routes pass through ${chain}`
    : `${guarded} of ${total} routes pass through ${chain}`;
}

/** Whether an edge keeps its label visible (and reserves layout space for it). */
export function labelEdge(view: GraphView, edge: ViewEdge): boolean {
  if (edge.label === "") return false;
  if (view.mode === "flow") return true;
  // Arrows into the side column converge on a few cards; their labels show on hover and selection.
  const side = new Set(view.nodes.filter((node) => node.side).map((node) => node.id));
  if (side.has(edge.to) || side.has(edge.from)) return false;
  if (view.mode === "architecture") return edge.label !== "depends on" && edge.label !== "declares";
  return edge.edges[0]?.kind !== "targets-function" || (edge.guards?.length ?? 0) > 0;
}

export function viewEdge(edge: GraphEdge): ViewEdge {
  return {
    id: `${edge.from}->${edge.to}:${edge.kind}${edge.table === undefined ? "" : `:${edge.table}`}`,
    from: edge.from,
    to: edge.to,
    group: edgeGroup(edge),
    label: edgeVerb(edge),
    edges: [edge],
  };
}

export function syntheticEdge(from: string, to: string, label: string, group: EdgeGroup): ViewEdge {
  return { id: `${from}->${to}:${label}`, from, to, group, label, edges: [] };
}

export function dedupeEdges(edges: readonly ViewEdge[]): readonly ViewEdge[] {
  const seen = new Map<string, ViewEdge>();
  for (const edge of edges) if (!seen.has(edge.id)) seen.set(edge.id, edge);
  return [...seen.values()];
}
