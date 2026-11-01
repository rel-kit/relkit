/** Graph-derived domain membership: which routes, functions, events, channels and errors each domain owns. */
import type { GraphEdge, GraphNode, GraphSnapshot } from "../../lib/graph-model";
import {
  isRoute,
  nodeTitle,
  routeMethod,
  routePath,
  targetFunctionId,
} from "../../lib/graph-node-meta";

export interface DomainRoute {
  readonly node: GraphNode;
  readonly method: string;
  readonly path: string;
  readonly target?: string;
}

export interface DomainContents {
  readonly id: string;
  readonly service?: GraphNode;
  readonly routes: readonly DomainRoute[];
  readonly functions: readonly GraphNode[];
  readonly events: readonly GraphNode[];
  readonly channels: readonly GraphNode[];
  readonly errors: readonly GraphNode[];
  readonly dependsOn: readonly string[];
  readonly usedBy: readonly string[];
}

/** Pseudo-domain for routes and middleware no domain owns. */
export const APPLICATION_GROUP = "(application)";

export function domainContents(graph: GraphSnapshot): readonly DomainContents[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const services = graph.nodes.filter((node) => node.kind === "service");
  const ids = new Set<string>(services.map((node) => node.domainId ?? node.id));
  for (const node of graph.nodes)
    if (
      node.domainId &&
      (node.kind === "function" || node.kind === "event" || node.kind === "channel")
    )
      ids.add(node.domainId);

  const edges = graph.declaredEdges;
  const mounts = new Map(
    edges.filter((edge) => edge.kind === "mounts-service").map((edge) => [edge.from, edge.to]),
  );
  const routeDomain = (node: GraphNode): string | undefined => {
    if (node.domainId) return node.domainId;
    const target = targetFunctionId(node);
    const owner = target === undefined ? undefined : byId.get(target)?.domainId;
    return owner ?? mounts.get(node.id);
  };

  const result = new Map<string, Mutable>();
  const entry = (id: string): Mutable => {
    let value = result.get(id);
    if (!value) {
      const service = services.find((node) => (node.domainId ?? node.id) === id);
      value = {
        id,
        ...(service === undefined ? {} : { service }),
        routes: [],
        functions: [],
        events: [],
        channels: [],
        errors: new Map(),
        dependsOn: new Set(),
        usedBy: new Set(),
      };
      result.set(id, value);
    }
    return value;
  };
  for (const id of [...ids].sort()) entry(id);

  for (const node of graph.nodes) {
    if (isRoute(node)) {
      const owner = routeDomain(node);
      const target = targetFunctionId(node);
      entry(owner && ids.has(owner) ? owner : APPLICATION_GROUP).routes.push({
        node,
        method: routeMethod(node) ?? "HTTP",
        path: routePath(node) ?? "/",
        ...(target !== undefined && byId.get(target)?.kind === "function" ? { target } : {}),
      });
      continue;
    }
    if (!node.domainId || !ids.has(node.domainId)) continue;
    if (node.kind === "function") entry(node.domainId).functions.push(node);
    else if (node.kind === "event") entry(node.domainId).events.push(node);
    else if (node.kind === "channel") entry(node.domainId).channels.push(node);
    else if (node.kind === "error") entry(node.domainId).errors.set(node.id, node);
  }

  for (const edge of edges) addEdge(edge, byId, result, ids);

  return [...result.values()]
    .map((value) => ({
      ...value,
      routes: value.routes.sort(
        (left, right) =>
          left.path.localeCompare(right.path) || left.method.localeCompare(right.method),
      ),
      functions: value.functions.sort(byTitle),
      events: value.events.sort(byTitle),
      channels: value.channels.sort(byTitle),
      errors: [...value.errors.values()].sort(byTitle),
      dependsOn: [...value.dependsOn].sort(),
      usedBy: [...value.usedBy].sort(),
    }))
    .sort((left, right) =>
      left.id === APPLICATION_GROUP
        ? 1
        : right.id === APPLICATION_GROUP
          ? -1
          : left.id.localeCompare(right.id),
    );
}

function addEdge(
  edge: GraphEdge,
  byId: ReadonlyMap<string, GraphNode>,
  result: Map<string, Mutable>,
  ids: ReadonlySet<string>,
): void {
  if (edge.kind === "declares-error") {
    const owner = byId.get(edge.from)?.domainId;
    const error = byId.get(edge.to);
    if (owner && error && result.has(owner)) result.get(owner)?.errors.set(error.id, error);
    return;
  }
  if (edge.kind === "depends-on-service" && ids.has(edge.from) && ids.has(edge.to)) {
    result.get(edge.from)?.dependsOn.add(edge.to);
    result.get(edge.to)?.usedBy.add(edge.from);
  }
}

interface Mutable {
  readonly id: string;
  readonly service?: GraphNode;
  readonly routes: DomainRoute[];
  readonly functions: GraphNode[];
  readonly events: GraphNode[];
  readonly channels: GraphNode[];
  readonly errors: Map<string, GraphNode>;
  readonly dependsOn: Set<string>;
  readonly usedBy: Set<string>;
}

function byTitle(left: GraphNode, right: GraphNode): number {
  return nodeTitle(left).localeCompare(nodeTitle(right));
}

export function countSummary(contents: DomainContents): string {
  const parts = [
    [contents.routes.length, "route"],
    [contents.functions.length, "function"],
    [contents.events.length, "event"],
    [contents.channels.length, "channel"],
  ] as const;
  const text = parts
    .filter(([count]) => count > 0)
    .map(([count, noun]) => `${count} ${noun}${count === 1 ? "" : "s"}`)
    .join(" · ");
  return text || "empty";
}
