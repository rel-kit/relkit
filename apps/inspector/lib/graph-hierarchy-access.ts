/** What a route or function requires before it runs: session, role and middleware checks. */
import type { GraphNode } from "./graph-model";
import { functionErrors, routeAuth, routeResponses, targetFunctionId } from "./graph-node-meta";
import type { AppHierarchy } from "./graph-hierarchy.types";

/** What a route or function requires before it does any work. */
export interface Access {
  /** Rejects callers without a session (declares a 401). */
  readonly session: boolean;
  /** Rejects callers without the right role or ownership (declares a 403). */
  readonly role: boolean;
  /** Middleware that runs before the handler, in order. */
  readonly middleware: readonly string[];
  /** The function's `access` rule, checked by the engine for every caller. */
  readonly rule?: AccessRuleSummary;
}

/** Roles, permissions and whether an `allow` predicate decides, from the graph. */
export interface AccessRuleSummary {
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly predicate: boolean;
}

/** Reads a function node's `access` rule.
 * @param node - Function node.
 * @returns The rule, or undefined when the function has none.
 */
export function accessRule(node: GraphNode | undefined): AccessRuleSummary | undefined {
  const value = node?.meta?.access;
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const rule = value as Record<string, unknown>;
  const names = (field: unknown) =>
    Array.isArray(field) ? field.filter((entry): entry is string => typeof entry === "string") : [];
  return {
    roles: names(rule.roles),
    permissions: names(rule.permissions),
    predicate: rule.predicate === true,
  };
}

/** The route detail's auth line: its session requirement and its function's access rule.
 * @param auth - The route's `config.auth`.
 * @param access - The target function's `access` metadata.
 * @returns Such as "required · roles admin", or "none declared".
 */
export function routeAuthSummary(auth: unknown, access: unknown): string {
  const kind = auth !== null && typeof auth === "object" ? (auth as { kind?: unknown }).kind : "";
  const rule = accessRule({ meta: { access } } as unknown as GraphNode);
  const parts = [typeof kind === "string" && kind !== "" ? kind : undefined];
  if (rule !== undefined) parts.push(describeAccessRule(rule));
  const text = parts.filter((part) => part !== undefined).join(" · ");
  return text === "" ? "none declared" : text;
}

/** One line describing an access rule, such as "roles admin · permissions orders:refund". */
export function describeAccessRule(rule: AccessRuleSummary): string {
  return [
    rule.roles.length === 0 ? undefined : `roles ${rule.roles.join(", ")}`,
    rule.permissions.length === 0 ? undefined : `permissions ${rule.permissions.join(", ")}`,
    rule.predicate ? "allow predicate" : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

/** Session and role checks a function declares through its errors. */
export function functionAccess(node: GraphNode | undefined): Access {
  const statuses = new Set(
    (node === undefined ? [] : functionErrors(node)).map((error) => error.status),
  );
  const rule = accessRule(node);
  return {
    session: statuses.has(401) || rule !== undefined,
    role: statuses.has(403) || rule !== undefined,
    middleware: [],
    ...(rule === undefined ? {} : { rule }),
  };
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
    session: statuses.has(401) || handler.session || routeAuth(route) === "required",
    role: statuses.has(403) || handler.role,
    middleware,
    ...(handler.rule === undefined ? {} : { rule: handler.rule }),
  };
}

export function isProtected(access: Access): boolean {
  return access.session || access.role || access.middleware.length > 0;
}
