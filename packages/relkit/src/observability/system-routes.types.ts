/** Types of the framework-owned routes that requests are attributed to outside declared routes. */

/**
 * One request handler the framework mounts itself, with a stable route identifier.
 * @example const route: SystemRoute = { id: "relkit.rpc", method: "*", path: "/_relkit/v1/rpc", match: "prefix", description: "RPC" };
 */
export interface SystemRoute {
  /** Stable route identifier recorded as the request's `routeId`. */
  readonly id: string;
  /** HTTP method the handler answers; `*` for every method. */
  readonly method: "*" | "GET";
  /** Exact path, or the path prefix when `match` is `prefix`. */
  readonly path: string;
  /** Whether `path` is matched exactly or as a prefix of the request path. */
  readonly match: "exact" | "prefix";
  /** Short human description shown with the route. */
  readonly description: string;
}

/**
 * Route list entry shaped like a graph trigger node, so the inspection API's route collection can
 * list a system route beside declared routes.
 * @example const node: SystemRouteNode = { kind: "trigger", id: "relkit.rpc", system: true, description: "RPC", config: { method: "*", path: "/_relkit/v1/rpc/*" } };
 */
export interface SystemRouteNode {
  readonly kind: "trigger";
  readonly id: string;
  /** Marks a framework-owned route that no application file declares. */
  readonly system: true;
  readonly description: string;
  /** `path` ends with `/*` for a prefix route. */
  readonly config: { readonly method: "*" | "GET"; readonly path: string };
}
