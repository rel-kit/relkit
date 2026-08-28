import { createDescriptorBase, deepFreeze } from "@relkit/contracts";
import { createUnboundIdentity, SERVICE_POLICY } from "@relkit/invocation";
import type { FunctionRefAny } from "@relkit/functions";
import {
  assertServiceDescriptor,
  assertServiceMemberName,
  assertServiceMiddlewareDescriptor,
  assertServiceMiddlewareRef,
  freezeServiceDescriptor,
  normalizeServiceMemberName,
} from "./guards.js";
import { assertServiceFunctionOwnership, claimServiceFunctionOwnership } from "./ownership.js";
import type {
  DefineService,
  DefineServiceOptions,
  NonEmptyServiceFunctionMap,
  ServiceDescriptor,
  ServiceFunctionMap,
  ServiceMember,
  ServiceMiddlewareRefAny,
  ServiceRef,
} from "./types.js";

/**
 * Groups typed functions under one service identity and ordered policy stack.
 * Services expose member facades such as `Orders.getOrder`; they do not own a
 * second handler or become a workflow. Omit the service ID for source-derived
 * identity, and use the member facade for routes, tools, or `invoke` calls.
 *
 * @example
 * ```ts
 * import { defineFunction } from "@relkit/app/functions"
 * import { defineService } from "@relkit/app/services"
 * import { z } from "@relkit/app/schema"
 *
 * const getOrder = defineFunction({
 *   input: z.object({ orderId: z.string() }),
 *   output: z.object({ orderId: z.string() }),
 *   handler: async (input) => input
 * })
 * const Orders = defineService({ functions: { getOrder } })
 * void Orders.getOrder.invoke({ orderId: "order-1" })
 * ```
 * @category Services
 * @since 0.1.0
 */
export const defineService: DefineService = <
  const Id extends string,
  const Functions extends ServiceFunctionMap,
  const Middleware extends readonly ServiceMiddlewareRefAny[] = readonly ServiceMiddlewareRefAny[],
>(
  options: DefineServiceOptions<Id, Functions, Middleware>,
): ServiceDescriptor<Id, Functions, Middleware> => {
  const functions = copyFunctions(options.functions);
  const middleware = copyMiddleware(options.middleware);
  const id = (options.id === undefined ? createUnboundIdentity() : options.id) as Id;
  const base = createDescriptorBase("service", id, options);
  const policy = Object.freeze({
    serviceId: base.id,
    middleware: Object.freeze(
      (middleware ?? []).filter(
        (value) => typeof (value as { readonly handler?: unknown }).handler === "function",
      ),
    ),
  });
  const serviceRef: ServiceRef<Id> = Object.freeze(
    Object.defineProperty({ ref: base.ref }, SERVICE_POLICY, { value: policy }),
  );
  const candidate = {
    ...base,
    functions,
    ...(middleware === undefined ? {} : { middleware }),
  } as unknown as import("./types.js").ServiceDescriptorAny;
  assertServiceDescriptor(candidate);
  assertServiceFunctionOwnership(functions, base.id);

  const members: Record<string, unknown> = {};
  for (const [name, target] of Object.entries(functions)) {
    members[name] = createMember(target, serviceRef);
  }
  claimServiceFunctionOwnership(functions, base.id);

  return freezeServiceDescriptor({ ...candidate, ...members }) as ServiceDescriptor<
    Id,
    Functions,
    Middleware
  >;
};

function copyFunctions<Functions extends ServiceFunctionMap>(
  functions: NonEmptyServiceFunctionMap<Functions>,
): Functions {
  if (!isRecord(functions) || Object.keys(functions).length === 0) {
    throw new TypeError("A service needs at least one function");
  }
  const names = new Set<string>();
  const result: Record<string, FunctionRefAny> = {};
  for (const [rawName, target] of Object.entries(functions)) {
    const name = normalizeServiceMemberName(rawName);
    assertServiceMemberName(rawName);
    if (names.has(name)) throw new TypeError(`Duplicate service member "${name}"`);
    names.add(name);
    result[rawName] = target;
  }
  return Object.freeze(result) as Functions;
}

function copyMiddleware(
  values: readonly ServiceMiddlewareRefAny[] | undefined,
): readonly ServiceMiddlewareRefAny[] | undefined {
  if (values === undefined) return undefined;
  if (!Array.isArray(values)) throw new TypeError("Service middleware must be an array");
  return Object.freeze(
    values.map((value) => {
      assertServiceMiddlewareRef(value);
      if (isMiddlewareDescriptorShape(value)) assertServiceMiddlewareDescriptor(value);
      return value;
    }),
  );
}

function createMember<ServiceId extends string, Target extends FunctionRefAny>(
  target: Target,
  service: ServiceRef<ServiceId>,
): ServiceMember<ServiceId, Target> {
  const descriptors: PropertyDescriptorMap = Object.getOwnPropertyDescriptors(target);
  descriptors.service = {
    value: service,
    enumerable: true,
    writable: false,
    configurable: false,
  };
  return deepFreeze(Object.defineProperties({}, descriptors)) as ServiceMember<ServiceId, Target>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMiddlewareDescriptorShape(value: object): boolean {
  return "kind" in value || "id" in value || "handler" in value;
}
