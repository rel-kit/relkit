import { createDescriptorBase, deepFreeze, isRef } from "@relkit/contracts";
import { createUnboundIdentity } from "@relkit/invocation";
import type { FunctionRefAny } from "@relkit/functions";
import type { StandardSchemaV1 } from "@relkit/schema";
import {
  assertRequestMapping,
  assertResponse,
  type HttpMethod,
  type HttpRequestContentType,
  type HttpRequestMapping,
  type HttpResponseMapping,
} from "./http-dsl.js";
import { copyRateLimit, positive, successStatus } from "./route-options.js";
import { copyProtectedPaths, readBetterAuthRegistration } from "./route-auth.js";
import type {
  FunctionRouteDescriptor,
  FunctionRouteOptions,
  RawRouteDescriptor,
  RawRouteOptions,
  RouteDescriptor,
} from "./route-types.js";

export type * from "./route-types.js";

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
  if (hasOwn(options, "handler")) return rawRoute(options as RawRouteOptions<string>);
  const route = options as FunctionRouteOptions<
    string,
    FunctionRefAny,
    HttpRequestMapping | undefined
  >;
  if (!isFunctionTarget(route.target))
    throw new TypeError("Route target must be a function reference");
  if (route.request !== undefined) assertRequestMapping(route.request);
  const responses = copyResponses(route.responses);
  const accept = requestContentType(route.accept);
  const timeoutMs = positive(route.timeoutMs, "timeoutMs");
  const maxBodyBytes = positive(route.maxBodyBytes, "maxBodyBytes");
  const status = successStatus(route.successStatus);
  const rateLimit = copyRateLimit(route.rateLimit);
  const id = route.id === undefined ? createUnboundIdentity() : route.id;
  const base = createDescriptorBase("route", id, route);
  const legacy = route as typeof route & {
    readonly method?: HttpMethod;
    readonly path?: string;
  };
  return deepFreeze({
    ...base,
    // Retained only so the compiler can emit a source-located migration diagnostic.
    ...(legacy.method === undefined ? {} : { method: legacy.method }),
    ...(legacy.path === undefined ? {} : { path: legacy.path }),
    target: route.target,
    ...(accept === undefined ? {} : { accept }),
    ...(route.request === undefined ? {} : { request: route.request }),
    ...(responses === undefined ? {} : { responses }),
    ...(status === undefined ? {} : { successStatus: status }),
    ...(maxBodyBytes === undefined ? {} : { maxBodyBytes }),
    ...(rateLimit === undefined ? {} : { rateLimit }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  }) as FunctionRouteDescriptor<string>;
}

function rawRoute(options: RawRouteOptions<string>): RawRouteDescriptor<string> {
  if (typeof options.handler !== "function" || hasOwn(options, "target")) {
    throw new TypeError("Raw routes require only a handler");
  }
  const base = createDescriptorBase("route", options.id ?? createUnboundIdentity(), options);
  const registration = readBetterAuthRegistration(options.handler);
  if (options.auth !== undefined && registration === undefined) {
    throw new TypeError("Route auth options require a Better Auth service handler");
  }
  const protectedPaths = copyProtectedPaths(options.auth?.protected);
  return deepFreeze({
    ...base,
    raw: true as const,
    handler: options.handler,
    ...(registration === undefined
      ? {}
      : {
          auth: {
            kind: "better-auth" as const,
            protected: protectedPaths,
            service: { ref: registration.service.ref },
          },
        }),
  });
}

function requestContentType(value: unknown): HttpRequestContentType | undefined {
  if (value === undefined) return undefined;
  if (value === "application/json" || value === "multipart/form-data") return value;
  throw new TypeError('Route accept must be "application/json" or "multipart/form-data"');
}

function copyResponses(
  values: readonly HttpResponseMapping[] | undefined,
): readonly HttpResponseMapping[] | undefined {
  if (values === undefined) return undefined;
  if (!Array.isArray(values) || values.length === 0)
    throw new TypeError("A route needs one response mapping");
  const ids = new Set<string>();
  const result = values.map((value) => {
    const response = assertResponse(value);
    if (ids.has(response.id)) throw new TypeError(`Duplicate route response "${response.id}"`);
    ids.add(response.id);
    return response;
  });
  return Object.freeze(result);
}

function isFunctionTarget(value: unknown): value is FunctionRefAny {
  return (
    isRecord(value) &&
    isRef(value.ref, "function") &&
    isSchema(value.input) &&
    isSchema(value.output)
  );
}
function isSchema(value: unknown): value is StandardSchemaV1 {
  return (
    isRecord(value) &&
    isRecord(value["~standard"]) &&
    value["~standard"].version === 1 &&
    typeof value["~standard"].validate === "function"
  );
}
function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
