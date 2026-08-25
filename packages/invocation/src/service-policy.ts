import type { MaybePromise } from "@zsys/contracts";
import { getDescriptorIdentity } from "./identity.js";

export const SERVICE_POLICY = Symbol.for("zsys.service.policy");

export interface InvocationServiceMiddlewareInvocation {
  readonly input: unknown;
  readonly context: unknown;
}

export type InvocationServiceNext = (patch?: Readonly<Record<string, unknown>>) => Promise<void>;

export interface InvocationServiceMiddleware {
  readonly handler: (
    invocation: InvocationServiceMiddlewareInvocation,
    next: InvocationServiceNext,
  ) => MaybePromise<void>;
}

export interface InvocationServicePolicy {
  readonly serviceId: string;
  readonly middleware: readonly InvocationServiceMiddleware[];
}

export type ServicePolicySource = Readonly<Record<string, unknown>> | ReadonlyMap<string, unknown>;

export function resolveServicePolicy(
  target: unknown,
  source: ServicePolicySource | undefined,
): InvocationServicePolicy | undefined {
  const direct = policyOf(readProperty(target, "service")) ?? policyOf(target);
  if (direct !== undefined) return direct;
  if (source === undefined) return undefined;

  const targetIdentity = identityOf(target);
  if (targetIdentity === undefined) return undefined;
  for (const [key, value] of entries(source)) {
    if (!isRecord(value) || !isRecord(value.functions)) continue;
    for (const member of Object.values(value.functions)) {
      if (member === target || identityOf(member) === targetIdentity) {
        return policyOf(value) ?? middlewarePolicy(key, value);
      }
    }
  }
  return undefined;
}

export async function runServicePolicy(
  policy: InvocationServicePolicy,
  input: unknown,
  context: unknown,
  terminal: (context: unknown) => MaybePromise<unknown>,
): Promise<unknown> {
  let result: unknown;
  const base = serviceContext(context);

  const run = async (index: number, service: Readonly<Record<string, unknown>>): Promise<void> => {
    const current = Object.freeze({ ...contextRecord(context), service });
    const middleware = policy.middleware[index];
    if (middleware === undefined) {
      result = await terminal(current);
      return;
    }
    await middleware.handler(Object.freeze({ input, context: current }), async (patch) => {
      await run(index + 1, mergeServiceContext(service, patch));
    });
  };

  await run(0, base);
  return result;
}

function policyOf(value: unknown): InvocationServicePolicy | undefined {
  if (!isRecord(value)) return undefined;
  const policy = value[SERVICE_POLICY];
  if (!isRecord(policy) || typeof policy.serviceId !== "string") return undefined;
  return middlewarePolicy(policy.serviceId, policy);
}

function middlewarePolicy(
  serviceId: string,
  value: Record<PropertyKey, unknown>,
): InvocationServicePolicy {
  const middleware = Array.isArray(value.middleware) ? value.middleware.filter(isMiddleware) : [];
  return Object.freeze({ serviceId, middleware: Object.freeze(middleware) });
}

function isMiddleware(value: unknown): value is InvocationServiceMiddleware {
  return isRecord(value) && typeof value.handler === "function";
}

function mergeServiceContext(
  current: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  if (patch !== undefined && !isRecord(patch)) {
    throw new TypeError("Service middleware context patch must be an object");
  }
  return cloneFrozenRecord({ ...current, ...(patch ?? {}) });
}

function serviceContext(value: unknown): Readonly<Record<string, unknown>> {
  const service = readProperty(value, "service");
  return isRecord(service) ? cloneFrozenRecord(service) : Object.freeze({});
}

function cloneFrozenRecord(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return cloneFrozenValue({ ...value }, new WeakMap()) as Readonly<Record<string, unknown>>;
}

function cloneFrozenValue(value: unknown, seen: WeakMap<object, object>): unknown {
  if (value === null || typeof value !== "object") return value;
  const existing = seen.get(value);
  if (existing !== undefined) return existing;
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) copy.push(cloneFrozenValue(item, seen));
    return Object.freeze(copy);
  }
  const prototype = Object.getPrototypeOf(value);
  // ponytail: opaque non-plain values stay by reference; clone them only if service context becomes serializable.
  if (prototype !== Object.prototype && prototype !== null) return value;
  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const [key, child] of Object.entries(value)) copy[key] = cloneFrozenValue(child, seen);
  return Object.freeze(copy);
}

function contextRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function identityOf(value: unknown): string | undefined {
  if (!isRecord(value) || (typeof value.id !== "string" && !isRecord(value.ref))) return undefined;
  try {
    return getDescriptorIdentity(value);
  } catch {
    return undefined;
  }
}

function entries(source: ServicePolicySource): Iterable<readonly [string, unknown]> {
  return source instanceof Map ? source.entries() : Object.entries(source);
}

function readProperty(value: unknown, key: PropertyKey): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object";
}
