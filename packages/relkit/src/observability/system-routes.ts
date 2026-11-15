/**
 * Catalogue of the routes the framework handles itself: the mounted Better Auth handler, the
 * public `/healthz` probe of generated servers and the framework RPC endpoint. Requests they
 * handle match no declared route, so the HTTP runtime records them under these stable route
 * identifiers instead of `unknown`, and the inspection API lists them as system routes. The
 * `/_relkit/v1/health/*` probes are control-plane endpoints that are never recorded.
 */
import { FRAMEWORK_RPC_PATH } from "../contracts/client-api.js";
import type { SystemRoute, SystemRouteNode } from "./system-routes.types.js";

export type { SystemRoute, SystemRouteNode } from "./system-routes.types.js";

/** Stable identifiers of the framework-owned routes. */
export const SYSTEM_ROUTE_IDS = Object.freeze({
  auth: "relkit.auth",
  health: "relkit.system.health",
  rpc: "relkit.rpc",
} as const);

const HEALTH_ROUTE: SystemRoute = Object.freeze({
  id: SYSTEM_ROUTE_IDS.health,
  method: "GET",
  path: "/healthz",
  match: "exact",
  description: "Readiness probe of the generated server",
});

const RPC_ROUTE: SystemRoute = Object.freeze({
  id: SYSTEM_ROUTE_IDS.rpc,
  method: "*",
  path: FRAMEWORK_RPC_PATH,
  match: "prefix",
  description: "Framework RPC endpoint of the typed client",
});

/**
 * Describes the authentication handler RelKit mounts at a Better Auth base path.
 * @param basePath - Base path of the mounted handler, such as `/api/auth`.
 * @returns The system route answering every method under that path.
 */
export function authSystemRoute(basePath: string): SystemRoute {
  return Object.freeze({
    id: SYSTEM_ROUTE_IDS.auth,
    method: "*",
    path: basePath.replace(/\/$/, "") || "/",
    match: "prefix",
    description: "Mounted Better Auth handler",
  });
}

/**
 * Finds the path-identified system route of a request: the health probe or RPC.
 * @param path - Request path without query.
 * @returns The matching system route, or undefined. Authentication is attributed by its mount.
 */
export function systemRouteForPath(path: string): SystemRoute | undefined {
  if (path === HEALTH_ROUTE.path) return HEALTH_ROUTE;
  if (path === RPC_ROUTE.path || path.startsWith(`${RPC_ROUTE.path}/`)) return RPC_ROUTE;
  return undefined;
}

/**
 * Lists the system routes of an application graph as route-collection entries.
 * @param graph - Graph whose service nodes say whether RelKit mounts a Better Auth handler.
 * @returns Health and RPC entries, plus one authentication entry per mounted handler.
 */
export function systemRouteNodes(graph: {
  readonly nodes: readonly unknown[];
}): readonly SystemRouteNode[] {
  const routes = [
    ...mountedAuthBasePaths(graph.nodes).map(authSystemRoute),
    HEALTH_ROUTE,
    RPC_ROUTE,
  ];
  return Object.freeze(routes.map(routeNode));
}

/**
 * Projects a system route into its route-collection entry.
 * @param route - System route.
 * @returns A frozen trigger-shaped entry whose prefix path ends with `/*`.
 */
function routeNode(route: SystemRoute): SystemRouteNode {
  return Object.freeze({
    kind: "trigger",
    id: route.id,
    system: true,
    description: route.description,
    config: Object.freeze({
      method: route.method,
      path: route.match === "prefix" ? `${route.path.replace(/\/$/, "")}/*` : route.path,
    }),
  });
}

/**
 * Reads the base paths of Better Auth handlers RelKit mounts from graph service nodes.
 * @param nodes - Untrusted graph nodes.
 * @returns Base paths of services whose capability says RelKit mounts the handler.
 */
function mountedAuthBasePaths(nodes: readonly unknown[]): string[] {
  return nodes.flatMap((node) => {
    const capability = field(node, "capability");
    if (field(node, "kind") !== "service" || field(capability, "kind") !== "better-auth") return [];
    const basePath = field(capability, "basePath");
    return field(capability, "mount") === true && typeof basePath === "string" ? [basePath] : [];
  });
}

/**
 * Reads one property of an untrusted object.
 * @param value - Candidate object.
 * @param key - Property name.
 * @returns The property value, or undefined when `value` is not an object.
 */
function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}
