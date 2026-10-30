/** One domain up close: its members inside a box, neighbours and platform services outside. */
import type { GraphEdge, GraphNode } from "./graph-model";
import { type AppHierarchy, functionAccess, isProtected, routeAccess } from "./graph-hierarchy";
import { capabilityDetail, isRoute, nodeTitle } from "./graph-node-meta";
import { edgeGroup, isHiddenEdge } from "./graph-semantics";
import { domainCard, itemNode } from "./graph-views-cards";
import { dedupeEdges, groupNoun, guardNames, guardSentence, viewEdge } from "./graph-views-edges";
import { finish } from "./graph-views-filters";
import type { GraphView, ViewEdge, ViewNode, ViewOptions } from "./graph-views.types";

export function domainView(
  hierarchy: AppHierarchy,
  domainId: string,
  options: ViewOptions = {},
): GraphView | undefined {
  const domain = hierarchy.domains.find((item) => item.id === domainId);
  if (domain === undefined) return undefined;
  const groupId = `group:${domain.id}`;
  const members = new Set(domain.members.map((node) => node.id));
  const nodes: ViewNode[] = [
    {
      id: groupId,
      type: "service",
      category: "service",
      title: domain.id,
      subtitle: "This domain. Cards outside the box belong to other domains or the platform.",
      node: domain.service,
    },
  ];
  const addMember = (node: GraphNode) => nodes.push(itemNode(node, hierarchy, groupId));
  domain.routes.forEach(addMember);
  domain.listeners.forEach(addMember);
  domain.functions.forEach(addMember);
  domain.events.forEach(addMember);
  domain.channels.forEach(addMember);
  domain.agents.forEach(addMember);
  domain.tools.forEach(addMember);
  domain.jobs.forEach(addMember);

  // Outside the domain the view speaks the map's language: other domains are domain cards with
  // aggregated arrows, and shared platform services (auth, tables) sit in the side column.
  const outside = new Map<string, ViewNode>();
  const { auth, database } = hierarchy.platform;
  const cardFor = (node: GraphNode): string | undefined => {
    if (node.kind === "table") {
      if (!outside.has(node.id)) outside.set(node.id, { ...itemNode(node, hierarchy), side: true });
      return node.id;
    }
    if (database !== undefined && node.id === database.id) {
      if (!outside.has(node.id))
        outside.set(node.id, {
          id: node.id,
          type: "service",
          category: "database",
          title: nodeTitle(node),
          subtitle: capabilityDetail(node) ?? "Database",
          node,
          side: true,
        });
      return node.id;
    }
    const owner = hierarchy.ownerOf.get(node.id);
    const neighbour = hierarchy.domains.find((item) => item.id === owner);
    if (neighbour === undefined || neighbour.id === domain.id) return undefined;
    if (!outside.has(neighbour.id)) outside.set(neighbour.id, domainCard(neighbour));
    return neighbour.id;
  };
  const edges: ViewEdge[] = [];
  const crossing = new Map<string, { from: string; to: string; edges: GraphEdge[] }>();
  const flipped = new Set(["listens-to-event", "exposes-as-tool"]);
  for (const edge of hierarchy.edges) {
    if (isHiddenEdge(edge) || edge.kind.startsWith("exposes-")) continue;
    if (edge.kind === "uses-middleware") continue;
    const fromIn = members.has(edge.from);
    const toIn = members.has(edge.to);
    if (!fromIn && !toIn) continue;
    if (edge.from === domain.id || edge.to === domain.id) continue;
    const from = hierarchy.nodes.get(edge.from);
    const to = hierarchy.nodes.get(edge.to);
    if (from === undefined || to === undefined) continue;
    if (fromIn && toIn) {
      const route = isRoute(from) ? from : undefined;
      const names =
        route !== undefined && edge.kind === "targets-function"
          ? guardNames(hierarchy, routeAccess(hierarchy, route).middleware)
          : [];
      edges.push(
        names.length === 0
          ? viewEdge(edge)
          : { ...viewEdge(edge), guards: names, guardNote: guardSentence(names, 1, 1) },
      );
      continue;
    }
    const a = fromIn ? edge.from : cardFor(from);
    const b = toIn ? edge.to : cardFor(to);
    if (a === undefined || b === undefined) continue;
    // Table access keeps one arrow per table; everything else crossing the boundary aggregates.
    if (to.kind === "table") {
      edges.push({ ...viewEdge(edge), to: b });
      continue;
    }
    const [source, target] = flipped.has(edge.kind) ? [b, a] : [a, b];
    const key = `${source}\u0000${target}\u0000${edgeGroup(edge)}`;
    const entry = crossing.get(key) ?? { from: source, to: target, edges: [] };
    entry.edges.push(edge);
    crossing.set(key, entry);
  }
  for (const entry of crossing.values()) {
    const group = edgeGroup(entry.edges[0]!);
    const kinds = new Set(entry.edges.map((edge) => edge.kind));
    const [one, many] = groupNoun[group];
    const count = entry.edges.length;
    edges.push({
      id: `${entry.from}->${entry.to}:${group}`,
      from: entry.from,
      to: entry.to,
      group,
      label:
        kinds.size === 1 && kinds.has("listens-to-event")
          ? "wakes"
          : kinds.size === 1 && kinds.has("publishes-event")
            ? "publishes"
            : `${count} ${count === 1 ? one : many}`,
      count,
      edges: entry.edges,
    });
  }
  // The domain reaches auth through the session checks its functions declare.
  const checks = domain.functions.filter((fn) => functionAccess(fn).session);
  if (auth !== undefined && checks.length > 0) {
    outside.set(auth.id, {
      id: auth.id,
      type: "service",
      category: "auth",
      title: nodeTitle(auth),
      subtitle: capabilityDetail(auth) ?? "Authentication",
      node: auth,
      side: true,
    });
    edges.push({
      id: `${groupId}->${auth.id}:session`,
      from: groupId,
      to: auth.id,
      group: "auth",
      label: `${checks.length} session ${checks.length === 1 ? "check" : "checks"}`,
      count: checks.length,
      edges: checks.map((fn) => ({
        relationship: "declared" as const,
        kind: "checks-session",
        from: fn.id,
        to: auth.id,
      })),
    });
  }
  const sideOrder = (node: ViewNode) =>
    node.category === "auth" ? 0 : node.category === "database" ? 1 : node.side ? 2 : 3;
  const outsideNodes = [...outside.values()].sort(
    (left, right) => sideOrder(left) - sideOrder(right) || left.id.localeCompare(right.id),
  );
  const guarded = domain.routes.filter((route) =>
    isProtected(routeAccess(hierarchy, route)),
  ).length;
  return finish(
    {
      mode: "domain",
      title: `${domain.id} domain`,
      subtitle: `${domain.routes.length} routes (${guarded} protected) · ${domain.functions.length} functions · ${domain.events.length} events · ${domain.channels.length} channels. Click a card for its details; double-click a route to follow its request.`,
      focusId: domain.id,
      nodes: [...nodes, ...outsideNodes],
      edges: dedupeEdges(edges),
      available: {},
    },
    options,
  );
}
