/** Names used when rendering a generated request method.
 * @example const names: RouteMethodNames = { method: "getOrder", type: "GetOrder" };
 */
export interface RouteMethodNames {
  readonly method: string;
  readonly type: string;
}
export type { ClientRoute } from "./generate-types.types.js";
