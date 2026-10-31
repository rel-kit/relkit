/** Synthetic route-group cards that stand for a set of HTTP routes. */
import type { GraphNode } from "./graph-model";
import { routeMethod, routePath } from "./graph-node-meta";

export function routeGroupId(ownerId: string): string {
  return `routes:${ownerId}`;
}

/**
 * Names a set of routes by the path they share: `/trips` for `/trips` and `/trips/:id`,
 * `/api/auth` for the auth catch-all, or the distinct roots when they differ.
 */
export function routeGroupLabel(routes: readonly GraphNode[]): string {
  const paths = routes.map((route) =>
    (routePath(route) ?? "")
      .split("/")
      .filter((segment) => segment !== "" && !/^[:*]/.test(segment) && !segment.endsWith("?")),
  );
  if (paths.length === 0) return "/";
  const first = paths[0]!;
  let shared = 0;
  while (shared < first.length && paths.every((segments) => segments[shared] === first[shared]))
    shared += 1;
  if (shared > 0) return `/${first.slice(0, shared).join("/")}`;
  const roots = [
    ...new Set(paths.flatMap((segments) => (segments[0] ? [segments[0]] : []))),
  ].sort();
  return roots.map((root) => `/${root}`).join(", ");
}

export function routeGroupNode(
  ownerId: string,
  routes: readonly GraphNode[],
  domainId: string | undefined,
): GraphNode {
  const methods = new Map<string, number>();
  for (const route of routes) {
    const method = routeMethod(route) ?? "ANY";
    methods.set(method, (methods.get(method) ?? 0) + 1);
  }
  return {
    id: routeGroupId(ownerId),
    kind: "route-group",
    label: routeGroupLabel(routes),
    ...(domainId === undefined ? {} : { domainId }),
    meta: {
      routeIds: routes.map((route) => route.id),
      methods: Object.fromEntries([...methods.entries()].sort()),
    },
  };
}
