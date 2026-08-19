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
import {
  isMiddlewareDescriptor,
  isMiddlewareRef,
  type MiddlewareDescriptor,
  type MiddlewareRef,
} from "./define-middleware.js";

export interface RouteDescriptor<
  Id extends string,
  Target extends FunctionRefAny = FunctionRefAny,
  Request extends HttpRequestMapping = HttpRequestMapping,
> extends DescriptorBase<"route", Id> {
  readonly method: HttpMethod;
  readonly path: string;
  readonly target: Target;
  readonly request: Request;
  readonly responses: readonly HttpResponseMapping[];
  readonly middleware?: readonly MiddlewareRef[];
  readonly timeoutMs?: number;
}
export interface DefineRouteOptions<
  Id extends string,
  Target extends FunctionRefAny,
  Request extends HttpRequestMapping,
> extends DescriptorMetadata {
  readonly id: Id;
  readonly method: HttpMethod;
  readonly path: string;
  readonly target: Target;
  readonly request: Request;
  readonly responses: readonly HttpResponseMapping[];
  readonly middleware?: readonly MiddlewareRef[];
  readonly timeoutMs?: number;
}

/** Defines an HTTP route that maps a request contract to an existing function reference. */
export function defineRoute<
  const Id extends string,
  const Target extends FunctionRefAny,
  const Request extends HttpRequestMapping,
>(options: DefineRouteOptions<Id, Target, Request>): RouteDescriptor<Id, Target, Request> {
  if (hasOwn(options, "handler")) throw new TypeError("Routes cannot own handlers");
  if (!isFunctionTarget(options.target))
    throw new TypeError("Route target must be a function reference");
  if (!isMethod(options.method))
    throw new TypeError(`Unsupported HTTP method: ${String(options.method)}`);
  assertPath(options.path);
  assertRequestMapping(options.request);
  const responses = copyResponses(options.responses);
  const middleware = copyMiddleware(options.middleware, responses);
  validateLimit(options.timeoutMs, "timeoutMs");
  const base = createDescriptorBase("route", options.id, options);
  return deepFreeze({
    ...base,
    method: options.method,
    path: options.path,
    target: options.target,
    request: options.request,
    responses,
    ...(middleware === undefined ? {} : { middleware }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  }) as RouteDescriptor<Id, Target, Request>;
}

function copyResponses(values: readonly HttpResponseMapping[]): readonly HttpResponseMapping[] {
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
  responses: readonly HttpResponseMapping[],
): readonly MiddlewareRef[] | undefined {
  if (values === undefined) return undefined;
  if (!Array.isArray(values)) throw new TypeError("Route middleware must be an array");
  const ids = new Set<string>();
  const responseIds = new Set(responses.map((response) => response.id));
  const result = values.map((value) => {
    if (!isMiddlewareRef(value))
      throw new TypeError("Route middleware must be a middleware reference");
    const id = value.ref.id;
    if (ids.has(id)) throw new TypeError(`Duplicate route middleware "${id}"`);
    ids.add(id);
    const decision = isMiddlewareDescriptor(value) ? value.decision : undefined;
    if (decision?.kind === "respond" && !isDeclaredResponse(decision.responseId, responses))
      throw new TypeError(`Middleware "${id}" responds with an undeclared route response`);
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
function isMethod(value: unknown): value is HttpMethod {
  return ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(String(value));
}
function assertPath(value: string): void {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.includes("?") ||
    value.includes("#")
  )
    throw new TypeError("HTTP route path must be an absolute path without query or hash");
}
function validateLimit(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1))
    throw new TypeError(`${name} must be a positive integer`);
}
function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
