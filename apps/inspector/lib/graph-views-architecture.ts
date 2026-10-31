/** The architecture map: route groups, one card per domain, then the shared platform services. */
import type { GraphEdge, GraphNode } from "./graph-model";
import { type AppHierarchy, PLATFORM_OWNER, functionAccess, routeAccess } from "./graph-hierarchy";
import { capabilityDetail, isRoute, nodeTitle } from "./graph-node-meta";
import { type EdgeGroup, type FilterId, edgeGroup, isHiddenEdge } from "./graph-semantics";
import { domainCard, itemNode, routeCount, routeGroupCard } from "./graph-views-cards";
import { groupPriority, guardNames, guardSentence, mapEdgeLabel } from "./graph-views-edges";
import { applyFilters, countFilters, resolveFilters } from "./graph-views-filters";
import type { GraphView, ViewEdge, ViewNode, ViewOptions } from "./graph-views.types";

/** Detail layers that fold into domain arrows on the map when their filter is off. */
const FOLDABLE: ReadonlySet<FilterId> = new Set<FilterId>([
  "events",
  "channels",
  "agents",
  "tools",
]);

/**
 * The application at a glance: route groups first, then one card per domain, then the platform
 * services (auth, database). Events, channels, agents and tools get their own cards;
 * switching their filter off folds them back into the domain arrows.
 */
export function architectureView(hierarchy: AppHierarchy, options: ViewOptions = {}): GraphView {
  const { hidden, keepGuarded } = resolveFilters(options);
  const full = buildArchitecture(hierarchy, { ...options, hidden: new Set() });
  const folded = [...hidden].some((id) => FOLDABLE.has(id))
    ? buildArchitecture(hierarchy, { ...options, hidden })
    : full;
  return applyFilters({ ...folded, available: countFilters(full) }, hidden, keepGuarded);
}

function buildArchitecture(hierarchy: AppHierarchy, options: ViewOptions): GraphView {
  const hidden = options.hidden ?? new Set<FilterId>();
  const show = (id: FilterId) => !hidden.has(id);
  const nodes: ViewNode[] = [];
  for (const domain of hierarchy.domains) {
    if (domain.routeGroup !== undefined) nodes.push(routeGroupCard(domain.routeGroup, hierarchy));
  }
  if (hierarchy.platform.routeGroup !== undefined)
    nodes.push(routeGroupCard(hierarchy.platform.routeGroup, hierarchy));
  nodes.push(...hierarchy.domains.map((domain) => domainCard(domain)));
  // Detail cards, owned by a domain, shown on the map unless folded.
  const detail = new Set<string>();
  for (const domain of hierarchy.domains) {
    const add = (list: readonly GraphNode[], filter: FilterId) => {
      if (!show(filter)) return;
      for (const node of list) {
        nodes.push({ ...itemNode(node, hierarchy), domainId: domain.id });
        detail.add(node.id);
      }
    };
    add(domain.events, "events");
    add(domain.channels, "channels");
    add(domain.agents, "agents");
    add(domain.tools, "tools");
  }
  const { database, auth } = hierarchy.platform;
  if (auth !== undefined) {
    const checks = hierarchy.domains.reduce(
      (total, domain) => total + domain.functions.filter((fn) => functionAccess(fn).session).length,
      0,
    );
    nodes.push({
      id: auth.id,
      type: "service",
      category: "auth",
      title: nodeTitle(auth),
      subtitle: capabilityDetail(auth) ?? "Authentication",
      counts: [
        { label: "session checks", value: checks },
        { label: "routes", value: hierarchy.platform.routes.length },
      ].filter((count) => count.value > 0),
      node: auth,
      side: true,
    });
  }
  if (database !== undefined) {
    nodes.push({
      id: database.id,
      type: "service",
      category: "database",
      title: nodeTitle(database),
      subtitle: capabilityDetail(database) ?? "Database",
      counts: [{ label: "tables", value: hierarchy.platform.tables.length }],
      node: database,
      side: true,
    });
  }
  if (options.platform) {
    for (const provider of hierarchy.platform.providers) {
      nodes.push({
        id: provider.id,
        type: "item",
        category: "platform",
        title: nodeTitle(provider),
        subtitle: "Provider",
        node: provider,
        side: true,
      });
    }
  }
  const cards = new Set(nodes.map((node) => node.id));
  const cardOf = (nodeId: string): string | undefined => {
    if (cards.has(nodeId) && !hierarchy.domains.some((domain) => domain.id === nodeId))
      return nodeId;
    const node = hierarchy.nodes.get(nodeId);
    if (node === undefined) return undefined;
    const owner = hierarchy.ownerOf.get(nodeId);
    if (isRoute(node)) {
      const group =
        owner === undefined || owner === PLATFORM_OWNER
          ? hierarchy.platform.routeGroup
          : hierarchy.domains.find((domain) => domain.id === owner)?.routeGroup;
      if (group !== undefined) return group.id;
    }
    if (owner !== undefined && owner !== PLATFORM_OWNER) return owner;
    if (node.kind === "table") return database?.id;
    if (cards.has(nodeId)) return nodeId;
    if (node.kind === "trigger") {
      const mounted = hierarchy.outgoing
        .get(nodeId)
        ?.find((edge) => edge.kind === "mounts-service");
      return mounted === undefined ? undefined : cardOf(mounted.to);
    }
    return undefined;
  };
  /** Edges whose arrow reads better reversed: the event wakes its listener, the tool runs a function. */
  const flipped = new Set(["listens-to-event", "exposes-as-tool"]);
  const aggregate = new Map<string, Map<EdgeGroup, GraphEdge[]>>();
  const push = (from: string, to: string, edge: GraphEdge) => {
    const key = `${from}\u0000${to}`;
    const groups = aggregate.get(key) ?? new Map<EdgeGroup, GraphEdge[]>();
    const group = edgeGroup(edge);
    groups.set(group, [...(groups.get(group) ?? []), edge]);
    aggregate.set(key, groups);
  };
  /** Per aggregated edge: the routes it carries and the middleware those routes pass through. */
  const routeGuards = new Map<
    string,
    { routes: Set<string>; guarded: Set<string>; names: string[] }
  >();
  for (const edge of hierarchy.edges) {
    if (isHiddenEdge(edge) && !(options.platform && edgeGroup(edge) === "platform")) continue;
    if (edge.kind.startsWith("exposes-") && edge.kind !== "exposes-as-tool") continue;
    if (edge.kind === "uses-middleware") continue;
    const a = cardOf(edge.from);
    const b = cardOf(edge.to);
    const [from, to] = flipped.has(edge.kind) ? [b, a] : [a, b];
    if (from === undefined || to === undefined || from === to) continue;
    const source = hierarchy.nodes.get(edge.from);
    if (edge.kind === "targets-function" && source !== undefined && isRoute(source)) {
      const key = `${from}\u0000${to}`;
      const entry = routeGuards.get(key) ?? { routes: new Set(), guarded: new Set(), names: [] };
      entry.routes.add(source.id);
      for (const name of guardNames(hierarchy, routeAccess(hierarchy, source).middleware)) {
        entry.guarded.add(source.id);
        if (!entry.names.includes(name)) entry.names.push(name);
      }
      routeGuards.set(key, entry);
    }
    push(from, to, edge);
  }
  // Domains reach auth through the session checks their functions declare.
  if (auth !== undefined) {
    for (const domain of hierarchy.domains) {
      for (const fn of domain.functions) {
        if (functionAccess(fn).session)
          push(domain.id, auth.id, {
            relationship: "declared",
            kind: "checks-session",
            from: fn.id,
            to: auth.id,
          });
      }
    }
  }
  // Detail cards nothing else reaches still belong somewhere: link them to their domain.
  for (const id of detail) {
    const linked = [...aggregate.keys()].some((key) => key.split("\u0000").includes(id));
    const owner = hierarchy.ownerOf.get(id);
    if (!linked && owner !== undefined && owner !== PLATFORM_OWNER)
      push(owner, id, { relationship: "declared", kind: "declares", from: owner, to: id });
  }
  const edges: ViewEdge[] = [...aggregate.entries()]
    .map(([key, groups]) => {
      const [from, to] = key.split("\u0000") as [string, string];
      const all = [...groups.values()].flat();
      const dominant = groupPriority.find((group) => groups.has(group)) ?? "structure";
      const guard = routeGuards.get(key);
      return {
        id: `${from}->${to}`,
        from,
        to,
        group: all.some((edge) => edge.kind === "checks-session") ? ("auth" as const) : dominant,
        label: mapEdgeLabel(hierarchy, from, to, all, groups),
        count: all.length,
        edges: all,
        ...(guard === undefined || guard.names.length === 0
          ? {}
          : {
              guards: guard.names,
              guardNote: guardSentence(guard.names, guard.guarded.size, guard.routes.size),
            }),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  return {
    mode: "architecture",
    title: "Architecture",
    subtitle: `${hierarchy.domains.length} domains · ${routeCount(hierarchy)} routes · ${hierarchy.platform.tables.length} tables. Click a card for its details; double-click to open it.`,
    nodes,
    edges,
    available: {},
  };
}
