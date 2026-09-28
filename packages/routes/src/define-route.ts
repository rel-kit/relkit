import type { FunctionRefAny } from "@relkit/functions";
import { Effect } from "effect";
import type { HttpRequestMapping } from "./http-dsl.types.js";
import type {
  FunctionRouteDescriptor,
  FunctionRouteOptions,
  RawRouteDescriptor,
  RawRouteOptions,
  RouteDescriptor,
} from "./route.types.js";
import { prepareRouteValue } from "./route-definition.js";
import {
  RouteOperationError,
  measureRoute,
  routeAttempt,
  routeIdentity,
  runRouteSync,
} from "./route-observability.js";

export type * from "./route.types.js";
const defineRouteOperation = Effect.fn("routes.route.define")(
  (
    options:
      | FunctionRouteOptions<string, FunctionRefAny, HttpRequestMapping | undefined>
      | RawRouteOptions<string>,
  ) =>
    measureRoute(
      "route.define",
      Effect.gen(function* () {
        const build = yield* routeAttempt("route.define", () => prepareRouteValue(options));
        const id = options.id === undefined ? yield* routeIdentity("route.define") : options.id;
        return yield* routeAttempt("route.define", () => build(id));
      }),
    ),
);

/** Defines a raw or function route through Effect.
 * @param options - Route handler or function target and transport policy.
 * @returns Effect yielding a frozen descriptor or RouteOperationError.
 * @example Effect.runSync(defineRouteEffect({ target: listOrders }));
 */
export function defineRouteEffect<
  const Id extends string,
  const Handler extends RawRouteOptions<Id>["handler"],
>(
  options: RawRouteOptions<Id, Handler>,
): Effect.Effect<RawRouteDescriptor<Id, Handler>, RouteOperationError>;
export function defineRouteEffect<
  const Id extends string,
  const Target extends FunctionRefAny,
  const Request extends HttpRequestMapping | undefined = undefined,
>(
  options: FunctionRouteOptions<Id, Target, Request>,
): Effect.Effect<FunctionRouteDescriptor<Id, Target, Request>, RouteOperationError>;
export function defineRouteEffect(
  options:
    | FunctionRouteOptions<string, FunctionRefAny, HttpRequestMapping | undefined>
    | RawRouteOptions<string>,
): Effect.Effect<RouteDescriptor<string>, RouteOperationError> {
  return defineRouteOperation(options);
}

/**
 * Defines one HTTP method exported by a nested `route.ts` module.
 *
 * The compiler derives the method from the named export and the path from the
 * file. Omit `id` for a source-derived route identity, and omit `request` and
 * `responses` when schema-based inference represents the transport; explicit
 * mappings replace inference completely. Matching path names map into reusable
 * function input.
 *
 * @example A GET route with inferred path and query input
 * ```ts
 * import { defineFunction } from "@relkit/app/functions"
 * import { defineRoute } from "@relkit/app/routes"
 * import { z } from "@relkit/app/schema"
 *
 * const listOrders = defineFunction({
 *   id: "orders.list",
 *   input: z.object({ status: z.string().optional() }),
 *   output: z.object({ count: z.number().int() }),
 *   handler: async () => ({ count: 0 })
 * })
 *
 * export const GET = defineRoute({ target: listOrders })
 * ```
 *
 * @category HTTP
 * @since 0.1.0
 * @param options - Route handler or function target and transport policy.
 * @returns Frozen route descriptor.
 * @throws TypeError for invalid authoring input.
 */
export function defineRoute<
  const Id extends string,
  const Handler extends RawRouteOptions<Id>["handler"],
>(options: RawRouteOptions<Id, Handler>): RawRouteDescriptor<Id, Handler>;
export function defineRoute<
  const Id extends string,
  const Target extends FunctionRefAny,
  const Request extends HttpRequestMapping | undefined = undefined,
>(options: FunctionRouteOptions<Id, Target, Request>): FunctionRouteDescriptor<Id, Target, Request>;
export function defineRoute(
  options:
    | FunctionRouteOptions<string, FunctionRefAny, HttpRequestMapping | undefined>
    | RawRouteOptions<string>,
): RouteDescriptor<string> {
  return runRouteSync(defineRouteOperation(options));
}
