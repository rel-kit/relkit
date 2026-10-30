/** What a route or function requires before it runs: session, role and middleware checks. */
import type { GraphNode } from "./graph-model";
import { functionErrors, routeResponses, targetFunctionId } from "./graph-node-meta";
import type { AppHierarchy } from "./graph-hierarchy.types";

/** What a route or function requires before it does any work. */
export interface Access {
  /** Rejects callers without a session (declares a 401). */
  readonly session: boolean;
  /** Rejects callers without the right role or ownership (declares a 403). */
  readonly role: boolean;
  /** Middleware that runs before the handler, in order. */
  readonly middleware: readonly string[];
}

/** Session and role checks a function declares through its errors. */
export function functionAccess(node: GraphNode | undefined): Access {
  const statuses = new Set(
    (node === undefined ? [] : functionErrors(node)).map((error) => error.status),
  );
  return { session: statuses.has(401), role: statuses.has(403), middleware: [] };
}

/**
 * Access for an HTTP route: middleware bound to it, plus the session and role checks its handler
 * declares (as 401 and 403 responses, or as errors on the target function).
 */
export function routeAccess(hierarchy: AppHierarchy, route: GraphNode): Access {
  const middleware = (hierarchy.outgoing.get(route.id) ?? [])
    .filter((edge) => edge.kind === "uses-middleware")
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    .map((edge) => edge.to);
  const statuses = new Set(routeResponses(route).map((response) => response.status));
  const target = targetFunctionId(route);
  const handler = functionAccess(target === undefined ? undefined : hierarchy.nodes.get(target));
  return {
    session: statuses.has(401) || handler.session,
    role: statuses.has(403) || handler.role,
    middleware,
  };
}

export function isProtected(access: Access): boolean {
  return access.session || access.role || access.middleware.length > 0;
}
