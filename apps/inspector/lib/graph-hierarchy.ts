/** Groups the flat application graph into domains, platform resources and ownership indexes. */
import type { GraphEdge, GraphNode, GraphSnapshot } from "./graph-model";
import {
  capabilityKind,
  databaseTables,
  isListener,
  isRoute,
  targetFunctionId,
} from "./graph-node-meta";
import { PLATFORM_KINDS } from "./graph-semantics";
import { routeGroupNode } from "./graph-hierarchy-route-groups";
import type { AppHierarchy, DomainGroup, PlatformGroup } from "./graph-hierarchy.types";

export type { AppHierarchy, DomainGroup, PlatformGroup } from "./graph-hierarchy.types";
export { functionAccess, isProtected, routeAccess, type Access } from "./graph-hierarchy-access";
export { routeGroupId, routeGroupLabel } from "./graph-hierarchy-route-groups";

export const PLATFORM_OWNER = "platform";

export function tableNodeId(name: string): string {
  return `table:${name}`;
}

export function buildHierarchy(snapshot: GraphSnapshot): AppHierarchy {
  const baseNodes = snapshot.nodes.filter((node) => !node.observed && node.parentId === undefined);
  const byId = new Map(baseNodes.map((node) => [node.id, node]));
  const declared = snapshot.declaredEdges.filter(
    (edge) => byId.has(edge.from) && byId.has(edge.to),
  );

  const services = baseNodes.filter((node) => node.kind === "service");
  const database = services.find((node) => capabilityKind(node) === "drizzle");
  const auth = services.find((node) => capabilityKind(node) === "better-auth");
  const domainServices = services.filter(
    (node) => node !== database && node !== auth && capabilityKind(node) === undefined,
  );

  const tables: GraphNode[] =
    database === undefined
      ? []
      : databaseTables(database).map((table) => ({
          id: tableNodeId(table.name),
          kind: "table",
          parentId: database.id,
          ...(database.domainId === undefined ? {} : { domainId: database.domainId }),
          label: table.name,
          meta: { table },
        }));
  const tableIds = new Set(tables.map((table) => table.id));
  for (const table of tables) byId.set(table.id, table);

  const edges: GraphEdge[] = declared.map((edge) =>
    edge.kind === "uses-table" &&
    edge.table !== undefined &&
    database !== undefined &&
    edge.to === database.id &&
    tableIds.has(tableNodeId(edge.table))
      ? { ...edge, to: tableNodeId(edge.table) }
      : edge,
  );

  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    push(outgoing, edge.from, edge);
    push(incoming, edge.to, edge);
  }

  const ownerOf = new Map<string, string>();
  const domainIds = new Set(domainServices.map((service) => service.id));
  for (const node of baseNodes) {
    if (node.kind === "service") {
      ownerOf.set(node.id, domainIds.has(node.id) ? node.id : PLATFORM_OWNER);
      continue;
    }
    if (PLATFORM_KINDS.has(node.kind)) {
      ownerOf.set(node.id, PLATFORM_OWNER);
      continue;
    }
    if (node.domainId !== undefined && domainIds.has(node.domainId)) {
      ownerOf.set(node.id, node.domainId);
    }
  }
  for (const table of tables) ownerOf.set(table.id, PLATFORM_OWNER);
  for (const node of baseNodes) {
    if (ownerOf.has(node.id) || node.kind !== "trigger") continue;
    const target = targetFunctionId(node);
    const targetOwner = target === undefined ? undefined : ownerOf.get(target);
    if (targetOwner !== undefined) {
      ownerOf.set(node.id, targetOwner);
      continue;
    }
    const mounted = outgoing.get(node.id)?.find((edge) => edge.kind === "mounts-service");
    if (mounted !== undefined) ownerOf.set(node.id, ownerOf.get(mounted.to) ?? PLATFORM_OWNER);
  }
  for (const node of baseNodes) {
    if (!ownerOf.has(node.id)) {
      const serviceEdge = incoming
        .get(node.id)
        ?.find((edge) => edge.kind.startsWith("exposes-") && domainIds.has(edge.from));
      ownerOf.set(node.id, serviceEdge?.from ?? PLATFORM_OWNER);
    }
  }

  const domains = domainServices
    .map((service) => {
      const members = baseNodes.filter((node) => ownerOf.get(node.id) === service.id);
      const pick = (predicate: (node: GraphNode) => boolean) =>
        members.filter((node) => node !== service && predicate(node)).sort(compareNodes);
      const routes = pick(isRoute);
      const routeGroup =
        routes.length === 0 ? undefined : routeGroupNode(service.id, routes, service.domainId);
      if (routeGroup !== undefined) {
        byId.set(routeGroup.id, routeGroup);
        ownerOf.set(routeGroup.id, service.id);
      }
      return {
        id: service.id,
        service,
        ...(routeGroup === undefined ? {} : { routeGroup }),
        routes,
        functions: pick((node) => node.kind === "function"),
        listeners: pick(isListener),
        events: pick((node) => node.kind === "event"),
        channels: pick((node) => node.kind === "channel"),
        tools: pick((node) => node.kind === "tool"),
        agents: pick((node) => node.kind === "agent" || node.kind === "graph"),
        jobs: pick((node) => node.kind === "job" || node.kind === "task"),
        members,
      } satisfies DomainGroup;
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  const platformNodes = baseNodes.filter((node) => ownerOf.get(node.id) === PLATFORM_OWNER);
  const platformRoutes = platformNodes.filter(isRoute).sort(compareNodes);
  const platformRouteGroup =
    platformRoutes.length === 0
      ? undefined
      : routeGroupNode(auth?.id ?? PLATFORM_OWNER, platformRoutes, auth?.domainId);
  if (platformRouteGroup !== undefined) {
    byId.set(platformRouteGroup.id, platformRouteGroup);
    ownerOf.set(platformRouteGroup.id, PLATFORM_OWNER);
  }
  const platform: PlatformGroup = {
    ...(platformRouteGroup === undefined ? {} : { routeGroup: platformRouteGroup }),
    ...(database === undefined ? {} : { database }),
    tables: tables.sort(compareNodes),
    ...(auth === undefined ? {} : { auth }),
    routes: platformRoutes,
    providers: platformNodes.filter((node) => node.kind === "provider").sort(compareNodes),
    env: platformNodes.filter((node) => node.kind === "env").sort(compareNodes),
    errors: platformNodes.filter((node) => node.kind === "error").sort(compareNodes),
    middleware: platformNodes.filter((node) => node.kind === "middleware").sort(compareNodes),
    other: platformNodes
      .filter(
        (node) =>
          node !== database &&
          node !== auth &&
          !isRoute(node) &&
          !["provider", "env", "error", "middleware", "app"].includes(node.kind),
      )
      .sort(compareNodes),
  };

  const app = baseNodes.find((node) => node.kind === "app");
  return {
    ...(app === undefined ? {} : { app }),
    appId: snapshot.appId ?? app?.id ?? "application",
    domains,
    platform,
    nodes: byId,
    edges,
    outgoing,
    incoming,
    ownerOf,
    hasTableUsage: edges.some((edge) => edge.kind === "uses-table"),
    hasCallGraph: edges.some((edge) => edge.kind === "calls-function"),
  };
}

export function domainOf(hierarchy: AppHierarchy, nodeId: string): DomainGroup | undefined {
  const owner = hierarchy.ownerOf.get(nodeId);
  return owner === undefined || owner === PLATFORM_OWNER
    ? undefined
    : hierarchy.domains.find((domain) => domain.id === owner);
}

export function edgesOf(hierarchy: AppHierarchy, nodeId: string): readonly GraphEdge[] {
  return [...(hierarchy.outgoing.get(nodeId) ?? []), ...(hierarchy.incoming.get(nodeId) ?? [])];
}

function push<Value>(map: Map<string, Value[]>, key: string, value: Value): void {
  const existing = map.get(key);
  if (existing === undefined) map.set(key, [value]);
  else existing.push(value);
}

function compareNodes(left: GraphNode, right: GraphNode): number {
  return left.id.localeCompare(right.id);
}
