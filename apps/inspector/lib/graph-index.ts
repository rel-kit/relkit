/** Graph-derived navigation data: sidebar counts and the command palette's entity index. */
import type { GraphNode, GraphSnapshot } from "./graph-model";
import {
  isListener,
  isRoute,
  listenedEventId,
  nodeTitle,
  routeMethod,
  routePath,
} from "./graph-node-meta";

/** Count of graph entities behind each sidebar destination; absent when the kind is not graph-backed. */
export function navigationCounts(
  graph: GraphSnapshot | undefined,
): Readonly<Record<string, number>> {
  if (!graph) return {};
  const counts: Record<string, number> = {};
  const add = (href: string) => {
    counts[href] = (counts[href] ?? 0) + 1;
  };
  const domains = new Set<string>();
  for (const node of graph.nodes) {
    if (node.domainId) domains.add(node.domainId);
    // Listeners are reached from the Events page but are not events themselves.
    const href = isListener(node) ? undefined : destination(node);
    if (href) add(href);
  }
  counts["/domains"] = domains.size;
  return counts;
}

export interface EntityEntry {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  /** One-line preview, e.g. "GET /trips/:id" or the domain. */
  readonly detail: string;
  readonly href: string;
}

/** Searchable entities for ⌘K, ordered by kind then label. */
export function entityIndex(graph: GraphSnapshot | undefined): readonly EntityEntry[] {
  if (!graph) return [];
  const entries: EntityEntry[] = [];
  for (const node of graph.nodes) {
    const href = destination(node);
    if (!href) continue;
    const kind = kindLabel(node);
    const method = isRoute(node) ? routeMethod(node) : undefined;
    const path = isRoute(node) ? routePath(node) : undefined;
    entries.push({
      id: node.id,
      kind,
      label: nodeTitle(node),
      detail: method && path ? `${method} ${path}` : (node.domainId ?? node.id),
      href: detailHref(node, href),
    });
  }
  return entries.sort(
    (left, right) => left.kind.localeCompare(right.kind) || left.label.localeCompare(right.label),
  );
}

/** Case-insensitive match on label, id and detail; every word must match somewhere. */
export function searchEntities(
  entries: readonly EntityEntry[],
  query: string,
  limit = 40,
): readonly EntityEntry[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const result: EntityEntry[] = [];
  for (const entry of entries) {
    const haystack = `${entry.label} ${entry.id} ${entry.detail} ${entry.kind}`.toLocaleLowerCase();
    if (words.every((word) => haystack.includes(word))) result.push(entry);
    if (result.length >= limit) break;
  }
  return result;
}

/**
 * Listeners have no page of their own, so they open the event they listen to. Nodes the agent
 * topology synthesizes (`<agentId>::tool::…`) are not API resources and open their agent.
 */
function detailHref(node: GraphNode, list: string): string {
  if (isListener(node)) {
    const event = listenedEventId(node);
    return event === undefined ? list : `/events/${encodeURIComponent(event)}`;
  }
  if (node.parentId !== undefined && node.id.startsWith(`${node.parentId}::`))
    return `/agents/${encodeURIComponent(node.parentId)}`;
  return `${list}/${encodeURIComponent(node.id)}`;
}

function destination(node: GraphNode): string | undefined {
  if (isRoute(node)) return "/routes";
  if (isListener(node)) return "/events";
  switch (node.kind) {
    case "function":
      return "/functions";
    case "middleware":
      return "/middlewares";
    case "error":
      return "/errors";
    case "job":
      return "/jobs";
    case "event":
      return "/events";
    case "channel":
      return "/channels";
    case "bucket":
      return "/buckets";
    case "cache":
      return "/cache";
    case "provider":
      return "/providers";
    case "agent":
      return "/agents";
    case "graph":
      return "/graphs";
    case "tool":
      return "/tools";
    default:
      return undefined;
  }
}

function kindLabel(node: GraphNode): string {
  if (isRoute(node)) return "Route";
  if (isListener(node)) return "Listener";
  return node.kind.charAt(0).toUpperCase() + node.kind.slice(1);
}
