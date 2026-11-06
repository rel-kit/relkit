import type { FunctionRefAny } from "../functions/index.js";
import type { InferOutput } from "../schema/index.js";

/** One cookie a route sets on its successful response.
 * @example const cookie: RouteCookie = { name: "session", value: "abc", httpOnly: true };
 */
export interface RouteCookie {
  readonly name: string;
  readonly value: string;
  readonly path?: string;
  readonly domain?: string;
  readonly maxAge?: number;
  readonly expires?: Date;
  readonly httpOnly?: boolean;
  readonly secure?: boolean;
  readonly sameSite?: "Strict" | "Lax" | "None";
}

/** Status, headers and cookies a route adds to its successful response.
 * @example const init: RouteResponseInit = { status: 201, headers: { location: "/orders/1" } };
 */
export interface RouteResponseInit {
  /** A 2xx status replacing the route's success status. */
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly cookies?: readonly RouteCookie[];
}

/** Computes the response settings from the target function's validated output.
 * @example const response: RouteResponseFor<typeof createOrder> = (order) => ({ status: 201 });
 */
export type RouteResponseFor<Target extends FunctionRefAny> = (
  output: InferOutput<Target["output"]>,
) => RouteResponseInit;
