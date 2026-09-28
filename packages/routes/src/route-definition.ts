import { createDescriptorBase, deepFreeze, isRef } from "@relkit/contracts";
import type { FunctionRefAny } from "@relkit/functions";
import type { StandardSchemaV1 } from "@relkit/schema";
import { assertRequestMappingValue } from "./http-dsl-mapping-validation.js";
import { assertResponseValue } from "./http-dsl-response-validation.js";
import type {
  HttpMethod,
  HttpRequestContentType,
  HttpRequestMapping,
  HttpResponseMapping,
} from "./http-dsl.types.js";
import { copyRateLimitValue, positiveValue, successStatusValue } from "./route-options.js";
import { copyProtectedValues, readRegistrationValue } from "./route-auth.js";
import { copyClientValue, copyStreamValue } from "./route-client.js";
import { RouteInputError } from "./route-observability.js";
import type {
  FunctionRouteDescriptor,
  FunctionRouteOptions,
  RawRouteDescriptor,
  RawRouteOptions,
  RouteDescriptor,
} from "./route.types.js";

/** Validates route options before acquiring an unbound identity.
 * @param options - Function or raw route authoring options.
 * @returns A builder that creates the frozen descriptor with a resolved ID.
 * @throws RouteInputError for invalid route inputs.
 * @example prepareRouteValue({ target })("orders.get");
 */
export function prepareRouteValue(
  options:
    | FunctionRouteOptions<string, FunctionRefAny, HttpRequestMapping | undefined>
    | RawRouteOptions<string>,
): (id: string) => RouteDescriptor<string> {
  if (!isRecord(options)) throw new RouteInputError("Route options must be an object");
  if (hasOwn(options, "handler")) {
    const raw = options as RawRouteOptions<string>;
    if (typeof raw.handler !== "function" || hasOwn(raw, "target"))
      throw new RouteInputError("Raw routes require only a handler");
    return (id) => rawRoute(raw, id);
  }
  const route = options as FunctionRouteOptions<
    string,
    FunctionRefAny,
    HttpRequestMapping | undefined
  >;
  if (!isFunctionTarget(route.target))
    throw new RouteInputError("Route target must be a function reference");
  if (route.request !== undefined) assertRequestMappingValue(route.request);
  const responses = copyResponses(route.responses);
  const accept = requestContentType(route.accept);
  const timeoutMs = positiveValue(route.timeoutMs, "timeoutMs");
  const maxBodyBytes = positiveValue(route.maxBodyBytes, "maxBodyBytes");
  const status = successStatusValue(route.successStatus);
  const rateLimit = copyRateLimitValue(route.rateLimit);
  const client = copyClientValue(route.client);
  const stream = copyStreamValue(route.stream, route.target.output);
  const legacy = route as typeof route & {
    readonly method?: HttpMethod;
    readonly path?: string;
  };
  return (id) =>
    deepFreeze({
      ...createDescriptorBase("route", id, route),
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
      ...(client === undefined ? {} : { client }),
      ...(stream === undefined ? {} : { stream }),
    }) as FunctionRouteDescriptor<string>;
}
function rawRoute(options: RawRouteOptions<string>, id: string): RawRouteDescriptor<string> {
  const base = createDescriptorBase("route", id, options);
  const registration = readRegistrationValue(options.handler);
  if (options.auth !== undefined && registration === undefined) {
    throw new RouteInputError("Route auth options require a Better Auth service handler");
  }
  const protectedPaths = copyProtectedValues(options.auth?.protected);
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
  throw new RouteInputError('Route accept must be "application/json" or "multipart/form-data"');
}

function copyResponses(
  values: readonly HttpResponseMapping[] | undefined,
): readonly HttpResponseMapping[] | undefined {
  if (values === undefined) return undefined;
  if (!Array.isArray(values) || values.length === 0)
    throw new RouteInputError("A route needs one response mapping");
  const ids = new Set<string>();
  const result = values.map((value) => {
    const response = assertResponseValue(value);
    if (ids.has(response.id))
      throw new RouteInputError(`Duplicate route response "${response.id}"`);
    ids.add(response.id);
    return response;
  });
  return Object.freeze(result);
}

function isFunctionTarget(value: unknown): value is FunctionRefAny {
  return (
    isRecord(value) &&
    value.invocationMode !== "event-only" &&
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
