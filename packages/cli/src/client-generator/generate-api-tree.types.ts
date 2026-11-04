import type { ClientApiRouteSource } from "relkit/contracts";

/** One public route and its rendered client contract type.
 * @example const entry: ApiTreeEntry = { id: "route.get.orders", method: "GET", path: "/orders", targetFunctionId: "orders.list", type: "unknown" };
 */
export interface ApiTreeEntry extends ClientApiRouteSource {
  readonly type: string;
}

/** One declared route error as the client sees it.
 * @example const error: ApiErrorType = { code: "orders.not-found", status: 404, data: "unknown" };
 */
export interface ApiErrorType {
  readonly code: string;
  readonly status?: number;
  readonly data: string;
}
