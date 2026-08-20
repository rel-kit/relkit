import {
  createDescriptorBase,
  deepFreeze,
  isRef,
  type DescriptorBase,
  type DescriptorMetadata,
} from "@zsys/contracts";
import type { FunctionRefAny } from "@zsys/functions";
import type { StandardSchemaV1 } from "@zsys/schema";
import {
  assertRequestMapping,
  assertResponse,
  isHttpResponseMapping,
  isMiddlewareDecision,
  type HttpMethod,
  type HttpRequestMapping,
  type HttpResponseMapping,
} from "./http-dsl.js";
import { copyRateLimit, positive, successStatus, type RouteRateLimit } from "./route-options.js";
import {
  isMiddlewareDescriptor,
  isMiddlewareRef,
  type MiddlewareDescriptor,
  type MiddlewareRef,
} from "./define-middleware.js";

export interface RouteDescriptor<
  Id extends string,
  Target extends FunctionRefAny = FunctionRefAny,
  Request extends HttpRequestMapping | undefined = HttpRequestMapping | undefined,
> extends DescriptorBase<"route", Id> {
  readonly method?: HttpMethod;
  readonly path?: string;
  readonly runtimePaths?: readonly string[];
  readonly target: Target;
  readonly request?: Request;
  readonly responses?: readonly HttpResponseMapping[];
  readonly successStatus?: number;
  readonly maxBodyBytes?: number;
  readonly rateLimit?: RouteRateLimit;
  readonly middleware?: readonly MiddlewareRef[];
  readonly timeoutMs?: number;
}
export interface DefineRouteOptions<
  Id extends string,
  Target extends FunctionRefAny,
  Request extends HttpRequestMapping | undefined = undefined,
> extends DescriptorMetadata {
  readonly id: Id;
  readonly target: Target;
  readonly request?: Request;
  readonly responses?: readonly HttpResponseMapping[];
  readonly successStatus?: number;
  readonly maxBodyBytes?: number;
  readonly rateLimit?: RouteRateLimit;
  readonly middleware?: readonly MiddlewareRef[];
  readonly timeoutMs?: number;
}

/**
 * Defines one HTTP method exported by a nested `route.ts` module.
 *
 * The compiler derives the method from the named export and the path from the
 * file. Omit `request` and `responses` when schema-based inference represents
 * the transport; explicit mappings replace inference completely.
 *
 * @example A GET route with inferred path and query input
 * ```ts
 * import { defineFunction, defineRoute } from "@zsys/app"
 * import { z } from "@zsys/schema"
 *
 * const listOrders = defineFunction({
 *   id: "orders.list",
 *   input: z.object({ status: z.string().optional() }),
 *   output: z.object({ count: z.number().int() }),
 *   handler: async () => ({ count: 0 })
 * })
 *
 * export const GET = defineRoute({ id: "orders.list.http", target: listOrders })
 * ```
 *
 * @category HTTP
 * @since 0.1.0
 */
export function defineRoute<
  const Id extends string,
  const Target extends FunctionRefAny,
  const Request extends HttpRequestMapping | undefined = undefined,
>(options: DefineRouteOptions<Id, Target, Request>): RouteDescriptor<Id, Target, Request> {
  if (hasOwn(options, "handler")) throw new TypeError("Routes cannot own handlers");
  if (!isFunctionTarget(options.target))
    throw new TypeError("Route target must be a function reference");
  if (options.request !== undefined) assertRequestMapping(options.request);
  const responses = copyResponses(options.responses);
  const middleware = copyMiddleware(options.middleware, responses);
  const timeoutMs = positive(options.timeoutMs, "timeoutMs");
  const maxBodyBytes = positive(options.maxBodyBytes, "maxBodyBytes");
  const status = successStatus(options.successStatus);
  const rateLimit = copyRateLimit(options.rateLimit);
  const base = createDescriptorBase("route", options.id, options);
  const legacy = options as DefineRouteOptions<Id, Target, Request> & {
    readonly method?: HttpMethod;
    readonly path?: string;
  };
  return deepFreeze({
    ...base,
    // Retained only so the compiler can emit a source-located migration diagnostic.
    ...(legacy.method === undefined ? {} : { method: legacy.method }),
    ...(legacy.path === undefined ? {} : { path: legacy.path }),
    target: options.target,
    ...(options.request === undefined ? {} : { request: options.request }),
    ...(responses === undefined ? {} : { responses }),
    ...(status === undefined ? {} : { successStatus: status }),
    ...(maxBodyBytes === undefined ? {} : { maxBodyBytes }),
    ...(rateLimit === undefined ? {} : { rateLimit }),
    ...(middleware === undefined ? {} : { middleware }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  }) as RouteDescriptor<Id, Target, Request>;
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

function copyMiddleware(
  values: readonly MiddlewareRef[] | undefined,
  responses: readonly HttpResponseMapping[] | undefined,
): readonly MiddlewareRef[] | undefined {
  if (values === undefined) return undefined;
  if (!Array.isArray(values)) throw new TypeError("Route middleware must be an array");
  const ids = new Set<string>();
  const result = values.map((value) => {
    if (!isMiddlewareRef(value))
      throw new TypeError("Route middleware must be a middleware reference");
    const id = value.ref.id;
    if (ids.has(id)) throw new TypeError(`Duplicate route middleware "${id}"`);
    ids.add(id);
    const decision = isMiddlewareDescriptor(value) ? value.decision : undefined;
    if (decision?.kind === "respond") {
      if (responses === undefined) {
        throw new TypeError(`Middleware "${id}" requires explicit route responses`);
      }
      if (!isDeclaredResponse(decision.responseId, responses)) {
        throw new TypeError(`Middleware "${id}" responds with an undeclared route response`);
      }
    }
    return value;
  });
  return Object.freeze(result);
}

function isDeclaredResponse(id: string, responses: readonly HttpResponseMapping[]): boolean {
  return responses.some(
    (response) =>
      response.id === id ||
      response.errorId === id ||
      (id === "validation" && response.kind === "validation-error"),
  );
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
