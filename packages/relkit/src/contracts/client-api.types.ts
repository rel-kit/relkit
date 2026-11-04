/** One public route as the typed client's API naming sees it.
 * @example const route: ClientApiRouteSource = { id: "route.get.orders", method: "GET", path: "/orders", targetFunctionId: "orders.search-orders" };
 */
export interface ClientApiRouteSource {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly targetFunctionId: string;
}
