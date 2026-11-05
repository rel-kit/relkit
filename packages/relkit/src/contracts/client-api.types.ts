/** One public route as the typed client's API naming sees it.
 * @example const route: ClientApiRouteSource = { id: "route.get.orders", method: "GET", path: "/orders", targetFunctionId: "orders.search-orders" };
 */
export interface ClientApiRouteSource {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly targetFunctionId: string;
}

/** One route in the client routes document, enough for a client to build its REST request.
 * @example const entry: ClientRouteEntry = { id: "route.get.orders", api: ["orders", "searchOrders"], method: "GET", path: "/orders", request: { kind: "input", fields: {} }, stream: null, operation: "query", errors: [] };
 */
export interface ClientRouteEntry {
  readonly id: string;
  /** Path below the `api` root, such as `["orders", "searchOrders"]`. */
  readonly api: readonly string[];
  readonly method: string;
  readonly path: string;
  /** The compiled request mapping (`kind: "input"`) the server reads the input with. */
  readonly request: unknown;
  readonly stream: "sse" | "text" | "bytes" | null;
  readonly operation: "query" | "mutation";
  /** Declared error codes, which keep their own code on the client. */
  readonly errors: readonly string[];
}

/** The document served at `CLIENT_ROUTES_PATH`.
 * @example const document: ClientRoutesDocument = { protocol: "relkit.client-routes", version: 1, routes: [] };
 */
export interface ClientRoutesDocument {
  readonly protocol: "relkit.client-routes";
  readonly version: 1;
  readonly routes: readonly ClientRouteEntry[];
}
