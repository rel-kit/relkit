/**
 * One route in the backend's client routes document (`/_relkit/v1/client/routes`), a copy
 * of `ClientRouteEntry` in `relkit/contracts` so the browser bundle needs no runtime import.
 */
export interface ClientRouteEntry {
  readonly id: string;
  /** Path below the `api` root, such as `["orders", "searchOrders"]`. */
  readonly api: readonly string[];
  readonly method: string;
  readonly path: string;
  /** The compiled request mapping the server reads the input with. */
  readonly request: unknown;
  readonly stream: "sse" | "text" | "bytes" | null;
  readonly operation: "query" | "mutation";
  /** Declared error codes. */
  readonly errors: readonly string[];
}

/** Looks routes up by the name a call uses. */
export interface RouteTable {
  /**
   * Finds the route a call path names: an `api` path (`["api", "orders", "getOrder"]`),
   * a `METHOD /path` selector or a route ID.
   * @param path - Call path.
   * @param signal - Cancels the table request.
   * @returns The route, or undefined when the backend has none by that name.
   */
  readonly find: (
    path: readonly string[],
    signal?: AbortSignal,
  ) => Promise<ClientRouteEntry | undefined>;
}
