import {
  deepFreeze,
  isRef,
  isStableId,
  normalizeId,
  type DescriptorMetadata,
} from "@zsys/contracts";
import type { FunctionRefAny } from "@zsys/functions";
import type { StandardSchemaV1 } from "@zsys/schema";
import {
  assertRequestMapping,
  isHttpRequestMapping,
  isMiddlewareDecision,
  type HttpRequestMapping,
  type MiddlewareDecisionMapping,
} from "./http-dsl.js";

export interface MiddlewareReference<Id extends string = string> {
  readonly kind: "middleware";
  readonly id: Id;
}
export interface MiddlewareRef<Id extends string = string> {
  readonly ref: MiddlewareReference<Id>;
}
export interface DefineMiddlewareOptions<
  Id extends string,
  Target extends FunctionRefAny,
  Request extends HttpRequestMapping,
> extends DescriptorMetadata {
  readonly id: Id;
  readonly target: Target;
  readonly request: Request;
  readonly decision: MiddlewareDecisionMapping;
}
export interface MiddlewareDescriptor<
  Id extends string,
  Target extends FunctionRefAny,
  Request extends HttpRequestMapping,
>
  extends DescriptorMetadata, MiddlewareRef<Id> {
  readonly kind: "middleware";
  readonly id: Id;
  readonly target: Target;
  readonly request: Request;
  readonly decision: MiddlewareDecisionMapping;
}

/**
 * Defines serializable route middleware backed by a function target.
 *
 * @example
 * ```ts
 * import { defineFunction } from "@zsys/functions"
 * import { defineMiddleware, http } from "@zsys/routes"
 * import { z } from "@zsys/schema"
 *
 * const authorize = defineFunction({ id: "auth", input: z.object({ token: z.string() }), output: z.void(), handler: async () => undefined })
 * const middleware = defineMiddleware({ id: "auth.http", target: authorize, request: http.input({ token: http.header("authorization") }), decision: http.continue() })
 * void middleware
 * ```
 * @category Middleware
 * @since 0.1.0
 */
export function defineMiddleware<
  const Id extends string,
  const Target extends FunctionRefAny,
  const Request extends HttpRequestMapping,
>(
  options: DefineMiddlewareOptions<Id, Target, Request>,
): MiddlewareDescriptor<Id, Target, Request> {
  if (hasOwn(options, "handler"))
    throw new TypeError("Middleware declarations cannot own handlers");
  const id = normalizeId(options.id) as unknown as Id;
  if (!isFunctionTarget(options.target))
    throw new TypeError("Middleware target must be a function reference");
  assertRequestMapping(options.request);
  if (!isMiddlewareDecision(options.decision))
    throw new TypeError("Middleware decision must be serializable");
  return deepFreeze({
    kind: "middleware" as const,
    id,
    ref: Object.freeze({ kind: "middleware" as const, id }),
    target: options.target,
    request: options.request,
    decision: options.decision,
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.description === undefined ? {} : { description: options.description }),
    ...(options.tags === undefined ? {} : { tags: Object.freeze([...options.tags]) }),
  }) as MiddlewareDescriptor<Id, Target, Request>;
}

export function isMiddlewareRef(value: unknown): value is MiddlewareRef {
  if (!isRecord(value) || !isRecord(value.ref)) return false;
  return value.ref.kind === "middleware" && isStableId(value.ref.id);
}

export function isMiddlewareDescriptor(
  value: unknown,
): value is MiddlewareDescriptor<string, FunctionRefAny, HttpRequestMapping> {
  if (!isMiddlewareRef(value) || !isRecord(value)) return false;
  const descriptor = value as MiddlewareDescriptor<string, FunctionRefAny, HttpRequestMapping>;
  return (
    descriptor.kind === "middleware" &&
    isFunctionTarget(descriptor.target) &&
    isHttpRequestMapping(descriptor.request) &&
    isMiddlewareDecision(descriptor.decision)
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
