import { isFunctionDescriptor, type ServiceDescriptor } from "@relkit/services";
import { Effect } from "effect";
import { defineRouteEffect } from "./define-route.js";
import type {
  ServiceRouteMethod,
  ServiceRoutesOptions,
  ServiceRoutesResult,
} from "./define-service-routes.types.js";
import {
  RouteInputError,
  RouteOperationError,
  measureRoute,
  runRouteSync,
} from "./route-observability.js";
import type { FunctionRouteDescriptor } from "./route.types.js";

export type {
  ServiceRouteMethod,
  ServiceRouteOptions,
  ServiceRouteEntry,
  ServiceRoutesOptions,
  ServiceRoutesResult,
} from "./define-service-routes.types.js";

export const SERVICE_ROUTE_METHODS = Object.freeze([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const);

/** Creates explicit service routes through an Effect.
 * @param service - Service descriptor owning public functions.
 * @param options - Explicit method to member table.
 * @returns Frozen route table or tagged validation failure.
 * @example Effect.runSync(defineServiceRoutesEffect(service, { GET: "list" }));
 */
export const defineServiceRoutesEffect = Effect.fn("routes.service-routes.define")(
  <
    const Service extends ServiceDescriptor<string, any, any>,
    const Options extends ServiceRoutesOptions<Service>,
  >(
    service: Service,
    options: Options & Record<Exclude<keyof Options, ServiceRouteMethod>, never>,
  ) =>
    measureRoute(
      "service-routes.define",
      Effect.gen(function* () {
        if (!isRecord(service)) return yield* invalid("Service descriptor must be an object");
        if (!isRecord(options)) return yield* invalid("Service routes must be an object");
        const routes: Partial<Record<ServiceRouteMethod, FunctionRouteDescriptor<string>>> = {};
        for (const [method, entry] of Object.entries(options)) {
          if (!isServiceRouteMethod(method)) {
            return yield* invalid(`Invalid service route method "${method}"`);
          }
          const route = typeof entry === "string" ? { member: entry } : entry;
          if (!isRecord(route) || typeof route.member !== "string") {
            return yield* invalid(`Service route ${method} needs a member`);
          }
          const target = (service as Record<string, unknown>)[route.member];
          if (!isFunctionDescriptor(target)) {
            return yield* invalid(`Service member "${route.member}" is not a public function`);
          }
          const { member: _member, ...routeOptions } = route;
          routes[method] = yield* defineRouteEffect({ ...routeOptions, target });
        }
        return Object.freeze(routes) as ServiceRoutesResult<Service, Options>;
      }),
    ),
);

/** Creates explicit HTTP routes for a service synchronously.
 * @param service - Service descriptor owning public functions.
 * @param options - Explicit method to member table.
 * @returns Frozen route table.
 * @throws TypeError for invalid method or member references.
 * @example defineServiceRoutes(service, { GET: "list" });
 */
export function defineServiceRoutes<
  const Service extends ServiceDescriptor<string, any, any>,
  const Options extends ServiceRoutesOptions<Service>,
>(
  service: Service,
  options: Options & Record<Exclude<keyof Options, ServiceRouteMethod>, never>,
): ServiceRoutesResult<Service, Options> {
  return runRouteSync(defineServiceRoutesEffect(service, options));
}

function isServiceRouteMethod(value: string): value is ServiceRouteMethod {
  return SERVICE_ROUTE_METHODS.includes(value as ServiceRouteMethod);
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalid(reason: string): Effect.Effect<never, RouteOperationError> {
  return Effect.fail(
    new RouteOperationError({
      operation: "service-routes.define",
      reason,
      cause: new RouteInputError(reason),
    }),
  );
}
