/** Card builders shared by the explorer views: route groups, domains and single nodes. */
import type { GraphNode } from "./graph-model";
import { type AppHierarchy, type DomainGroup, isProtected, routeAccess } from "./graph-hierarchy";
import {
  capabilityDetail,
  isListener,
  isRoute,
  listenedEventId,
  nodeDescription,
  nodeTitle,
  routeGroupMethods,
  routeGroupRouteIds,
  routeMethod,
  routePath,
  targetFunctionId,
} from "./graph-node-meta";
import { nodeCategory } from "./graph-semantics";
import { guardNames, guardSentence } from "./graph-views-edges";
import type { ViewNode } from "./graph-views.types";

export function routeCount(hierarchy: AppHierarchy): number {
  return (
    hierarchy.domains.reduce((total, domain) => total + domain.routes.length, 0) +
    hierarchy.platform.routes.length
  );
}

export function routeGroupCard(group: GraphNode, hierarchy: AppHierarchy): ViewNode {
  const methods = routeGroupMethods(group);
  const routes = routeGroupRouteIds(group).flatMap((id) => {
    const route = hierarchy.nodes.get(id);
    return route === undefined ? [] : [route];
  });
  const protectedCount = routes.filter((route) =>
    isProtected(routeAccess(hierarchy, route)),
  ).length;
  const names: string[] = [];
  let guarded = 0;
  for (const route of routes) {
    const routeNames = guardNames(hierarchy, routeAccess(hierarchy, route).middleware);
    if (routeNames.length > 0) guarded += 1;
    for (const name of routeNames) if (!names.includes(name)) names.push(name);
  }
  const total = routes.length;
  const access =
    protectedCount === 0
      ? "all public"
      : protectedCount === total
        ? "all protected"
        : `${protectedCount} protected`;
  return {
    id: group.id,
    type: "service",
    category: "route",
    title: group.label ?? group.id,
    subtitle: `${total} ${total === 1 ? "route" : "routes"} · ${access}`,
    counts: methods.map(({ method, count }) => ({ label: method, value: count })),
    node: group,
    rank: "first",
    ...(names.length === 0
      ? {}
      : { guards: names, guardNote: guardSentence(names, guarded, total) }),
  };
}

export function domainCard(domain: DomainGroup): ViewNode {
  const counts = [
    { label: "routes", value: domain.routes.length },
    { label: "functions", value: domain.functions.length },
    { label: "events", value: domain.events.length },
    { label: "channels", value: domain.channels.length },
  ].filter((count) => count.value > 0);
  if (domain.agents.length > 0) counts.push({ label: "agents", value: domain.agents.length });
  if (domain.jobs.length > 0) counts.push({ label: "jobs", value: domain.jobs.length });
  return {
    id: domain.id,
    type: "service",
    category: "service",
    title: domain.id,
    subtitle: nodeDescription(domain.service) ?? "Domain",
    counts,
    node: domain.service,
  };
}

export function itemNode(node: GraphNode, hierarchy: AppHierarchy, parentId?: string): ViewNode {
  const category = nodeCategory(node);
  const base = {
    id: node.id,
    type: node.kind === "table" ? ("table" as const) : ("item" as const),
    category,
    title: isRoute(node) ? (routePath(node) ?? nodeTitle(node)) : nodeTitle(node),
    node,
    ...(parentId === undefined ? {} : { parentId }),
  };
  const subtitle = itemSubtitle(node, hierarchy);
  const badges = itemBadges(node);
  const access = isRoute(node) ? routeAccess(hierarchy, node) : undefined;
  const names = access === undefined ? [] : guardNames(hierarchy, access.middleware);
  return {
    ...base,
    ...(subtitle === undefined ? {} : { subtitle }),
    ...(badges.length === 0 ? {} : { badges }),
    ...(access === undefined || !isProtected(access) ? {} : { access }),
    ...(names.length === 0 ? {} : { guards: names, guardNote: guardSentence(names, 1, 1) }),
  };
}

function itemSubtitle(node: GraphNode, hierarchy: AppHierarchy): string | undefined {
  if (isRoute(node)) {
    const target = targetFunctionId(node);
    const fn = target === undefined ? undefined : hierarchy.nodes.get(target);
    return fn === undefined ? undefined : `→ ${nodeTitle(fn)}`;
  }
  if (isListener(node)) {
    const target = targetFunctionId(node);
    const fn = target === undefined ? undefined : hierarchy.nodes.get(target);
    return fn === undefined ? undefined : `→ ${nodeTitle(fn)}`;
  }
  if (node.kind === "function") {
    const writes = new Set<string>();
    const reads = new Set<string>();
    const publishes: string[] = [];
    for (const edge of hierarchy.outgoing.get(node.id) ?? []) {
      if (edge.kind === "uses-table" && edge.table !== undefined)
        (edge.access === "write" ? writes : reads).add(edge.table);
      if (edge.kind === "publishes-event") publishes.push(edge.to);
    }
    const parts: string[] = [];
    if (writes.size > 0) parts.push(`writes ${[...writes].join(", ")}`);
    if (reads.size > 0) parts.push(`reads ${[...reads].join(", ")}`);
    if (publishes.length > 0) parts.push(`publishes ${publishes.length}`);
    return parts.length > 0 ? parts.join(" · ") : nodeDescription(node);
  }
  if (node.kind === "table") {
    const table = node.meta?.table as { columns?: readonly unknown[] } | undefined;
    const columns = table?.columns?.length ?? 0;
    return `${columns} ${columns === 1 ? "column" : "columns"}`;
  }
  if (node.kind === "event") {
    const version = node.meta?.version;
    return typeof version === "number" ? `v${version}` : undefined;
  }
  if (node.kind === "service") return capabilityDetail(node);
  return nodeDescription(node);
}

function itemBadges(node: GraphNode): readonly string[] {
  if (isRoute(node)) {
    const method = routeMethod(node);
    return method === undefined ? [] : [method];
  }
  if (isListener(node)) {
    const event = listenedEventId(node);
    return event === undefined ? [] : ["event"];
  }
  return [];
}

/** Route path including method, for breadcrumbs and titles. */
export function routeLabel(node: GraphNode): string {
  const method = routeMethod(node);
  const path = routePath(node);
  return method !== undefined && path !== undefined ? `${method} ${path}` : nodeTitle(node);
}
