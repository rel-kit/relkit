/** Shareable explorer state: the view, what it is scoped to, and the selected node. */
import { type AppHierarchy, PLATFORM_OWNER } from "./graph-hierarchy";
import { isListener, isRoute } from "./graph-node-meta";
import { type FilterId, isFilterId } from "./graph-semantics";
import {
  type GraphView,
  type ViewMode,
  architectureView,
  domainView,
  flowView,
} from "./graph-views";

export interface GraphLocation {
  /** Which view is open; architecture when absent. */
  readonly view?: ViewMode;
  /** Domain id for the domain view, entry node id for the flow view. */
  readonly scope?: string;
  /** Selected node, shown in the inspector. */
  readonly node?: string;
  /** Show the platform layer (providers, environment). */
  readonly platform?: boolean;
  /** Reading direction; top to bottom when absent. */
  readonly dir?: "down" | "right";
  /** Filters selected in the bar: only these kinds show. Empty or absent shows everything. */
  readonly only?: readonly FilterId[];
}

export const GRAPH_PATH = "/graph";

export function parseGraphLocation(params: URLSearchParams | null): GraphLocation {
  if (params === null) return {};
  const view = params.get("view");
  const scope = params.get("scope")?.trim();
  const node = params.get("node")?.trim();
  const only = [
    ...new Set(
      (params.get("only") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(isFilterId),
    ),
  ].sort();
  return {
    ...(view === "architecture" || view === "domain" || view === "flow" ? { view } : {}),
    ...(scope ? { scope } : {}),
    ...(node ? { node } : {}),
    ...(params.get("platform") === "1" ? { platform: true } : {}),
    ...(params.get("dir") === "right" ? { dir: "right" as const } : {}),
    ...(only.length > 0 ? { only } : {}),
  };
}

export function graphSearch(location: GraphLocation): string {
  const params = new URLSearchParams();
  if (location.view !== undefined && location.view !== "architecture")
    params.set("view", location.view);
  if (location.scope !== undefined) params.set("scope", location.scope);
  if (location.node !== undefined) params.set("node", location.node);
  if (location.platform) params.set("platform", "1");
  if (location.dir === "right") params.set("dir", "right");
  if (location.only !== undefined && location.only.length > 0)
    params.set("only", [...location.only].sort().join(","));
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

export function graphHref(location: GraphLocation): string {
  return `${GRAPH_PATH}${graphSearch(location)}`;
}

/** Nodes a request flow can start from. */
export function canFollow(hierarchy: AppHierarchy, nodeId: string): boolean {
  const node = hierarchy.nodes.get(nodeId);
  if (node === undefined) return false;
  if (node.kind === "function" || node.kind === "tool") return true;
  return isRoute(node) || isListener(node);
}

export function isDomainId(hierarchy: AppHierarchy, nodeId: string): boolean {
  return hierarchy.domains.some((domain) => domain.id === nodeId);
}

/** Picks the view a location describes, falling back to the closest sensible one. */
export function resolveView(hierarchy: AppHierarchy, location: GraphLocation): GraphView {
  const options = {
    platform: location.platform === true,
    only: new Set<FilterId>(location.only ?? []),
  };
  if (location.view === "flow" && location.scope !== undefined) {
    const flow = canFollow(hierarchy, location.scope)
      ? flowView(hierarchy, location.scope, options)
      : undefined;
    if (flow !== undefined) return flow;
  }
  if (location.view === "domain" && location.scope !== undefined) {
    const domain = domainView(hierarchy, location.scope, options);
    if (domain !== undefined) return domain;
  }
  return architectureView(hierarchy, options);
}

/** Location that opens the view a node naturally lives in, with the node selected. */
export function locationFor(
  hierarchy: AppHierarchy,
  nodeId: string,
  current: GraphLocation,
  view: GraphView,
): GraphLocation {
  const platform = current.platform === true ? { platform: true } : {};
  const node = hierarchy.nodes.get(nodeId);
  if (node === undefined) return { ...current, node: nodeId };
  if (isDomainId(hierarchy, nodeId))
    return { view: "domain", scope: nodeId, node: nodeId, ...platform };
  const onCanvas = view.nodes.some((item) => item.id === nodeId);
  if (onCanvas && (view.mode !== "architecture" || node.kind === "route-group"))
    return { ...current, node: nodeId };
  if (isRoute(node) || isListener(node))
    return { view: "flow", scope: nodeId, node: nodeId, ...platform };
  const owner = hierarchy.ownerOf.get(nodeId);
  if (owner !== undefined && owner !== PLATFORM_OWNER)
    return { view: "domain", scope: owner, node: nodeId, ...platform };
  return { view: "architecture", node: nodeId, ...platform };
}

/** Adds a kind to the selection, or removes it; an empty selection shows everything. */
export function toggleFilter(location: GraphLocation, id: FilterId): GraphLocation {
  const selected = new Set(location.only ?? []);
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  return { ...location, only: [...selected].sort() };
}

/** Clears the selection so every kind shows again. */
export function clearFilters(location: GraphLocation): GraphLocation {
  return { ...location, only: [] };
}

export function followLocation(nodeId: string, current: GraphLocation): GraphLocation {
  return {
    view: "flow",
    scope: nodeId,
    node: nodeId,
    ...(current.platform === true ? { platform: true } : {}),
  };
}

export function domainLocation(domainId: string, current: GraphLocation): GraphLocation {
  return {
    view: "domain",
    scope: domainId,
    node: domainId,
    ...(current.platform === true ? { platform: true } : {}),
  };
}

/** The location one level up: flow → its domain, domain → architecture. */
export function parentLocation(
  hierarchy: AppHierarchy,
  location: GraphLocation,
  view: GraphView,
): GraphLocation {
  const platform = location.platform === true ? { platform: true } : {};
  if (view.mode === "flow" && location.scope !== undefined) {
    const owner = hierarchy.ownerOf.get(location.scope);
    return owner !== undefined && owner !== PLATFORM_OWNER
      ? { view: "domain", scope: owner, node: location.scope, ...platform }
      : { ...platform };
  }
  if (view.mode === "domain")
    return { ...platform, ...(location.scope ? { node: location.scope } : {}) };
  return { ...platform };
}
