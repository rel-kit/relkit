import { deepFreeze, normalizeId } from "@relkit/contracts";
import {
  createUnboundIdentity,
  normalizeFailure,
  unexpectedDefect,
  type InvocationFailure,
} from "@relkit/invocation";
import type {
  DefineServiceMiddleware,
  DefineServiceMiddlewareOptions,
  ServiceContextPatch,
  ServiceMiddlewareDescriptor,
  ServiceMiddlewareHandler,
  ServiceMiddlewareNext,
} from "./types.js";
import { freezeServiceContextValue } from "./service-context.js";

export const SERVICE_MIDDLEWARE_POLICY_CODE = "RELKIT_SERVICE_MIDDLEWARE_POLICY" as const;

export type ServiceMiddlewarePolicyReason = "missing-next" | "duplicate-next" | "invalid-patch";

export class ServiceMiddlewarePolicyError extends TypeError {
  readonly code = SERVICE_MIDDLEWARE_POLICY_CODE;
  readonly reason: ServiceMiddlewarePolicyReason;

  constructor(reason: ServiceMiddlewarePolicyReason) {
    super(policyMessage(reason));
    this.name = "ServiceMiddlewarePolicyError";
    this.reason = reason;
  }
}

/**
 * Defines ordered, non-business policy for service members.
 *
 * The callback must call `next` exactly once. Its optional frozen patch enriches
 * the current invocation's read-only `context.service` value and never mutates
 * shared context.
 *
 * @example
 * ```ts
 * import { defineServiceMiddleware } from "@relkit/app/services"
 *
 * const tenantContext = defineServiceMiddleware({
 *   handler: async ({ input }, next) => {
 *     const value = input as { readonly tenantId?: string }
 *     await next({ tenantId: value.tenantId ?? "system" })
 *   }
 * })
 * void tenantContext
 * ```
 * @category Services
 * @since 0.1.0
 */
export const defineServiceMiddleware: DefineServiceMiddleware = <
  const Id extends string,
  Input,
  Context extends import("@relkit/functions").FunctionContext,
  Patch extends ServiceContextPatch,
>(
  options: DefineServiceMiddlewareOptions<Id, Input, Context, Patch>,
): ServiceMiddlewareDescriptor<Id, Input, Context, Patch> => {
  if (options === null || typeof options !== "object") {
    throw new TypeError("Service middleware options must be an object");
  }
  if (typeof options.handler !== "function") {
    throw new TypeError("Service middleware handler must be a function");
  }
  const id = normalizeId(
    options.id === undefined ? createUnboundIdentity() : options.id,
  ) as unknown as Id;
  const handler = wrapMiddlewareHandler(options.handler);
  return deepFreeze({
    kind: "service-middleware" as const,
    id,
    ref: Object.freeze({ kind: "service-middleware" as const, id }),
    handler,
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.description === undefined ? {} : { description: options.description }),
    ...(options.tags === undefined ? {} : { tags: Object.freeze([...options.tags]) }),
  }) as ServiceMiddlewareDescriptor<Id, Input, Context, Patch>;
};

export function normalizeServiceMiddlewareRejection(value: unknown): InvocationFailure {
  if (value instanceof ServiceMiddlewarePolicyError) {
    return unexpectedDefect(value, {
      code: value.code,
      message: "Service middleware policy defect",
    });
  }
  return normalizeFailure(value);
}

function wrapMiddlewareHandler<
  Input,
  Context extends import("@relkit/functions").FunctionContext,
  Patch extends ServiceContextPatch,
>(
  handler: ServiceMiddlewareHandler<Input, Context, Patch>,
): ServiceMiddlewareHandler<Input, Context, Patch> {
  return async (invocation, downstream) => {
    let called = false;
    let closed = false;
    let continuation: Promise<void> | undefined;
    let duplicate: ServiceMiddlewarePolicyError | undefined;
    let failure: unknown;
    let failed = false;

    const next: ServiceMiddlewareNext<Patch> = (patch) => {
      if (closed || called) {
        duplicate ??= new ServiceMiddlewarePolicyError("duplicate-next");
        return rejected(duplicate);
      }
      called = true;
      let frozenPatch: Patch | undefined;
      try {
        frozenPatch = freezePatch(patch);
      } catch (cause) {
        failure = cause;
        failed = true;
        return rejected(cause);
      }
      try {
        continuation = Promise.resolve(downstream(frozenPatch as Patch | undefined));
      } catch (cause) {
        continuation = rejected(cause);
      }
      return continuation;
    };

    try {
      await handler(invocation, next);
    } catch (cause) {
      failure = cause;
      failed = true;
    } finally {
      closed = true;
    }

    if (!failed && duplicate !== undefined) {
      failure = duplicate;
      failed = true;
    }
    if (!failed && !called) {
      failure = new ServiceMiddlewarePolicyError("missing-next");
      failed = true;
    }
    if (continuation !== undefined) {
      if (!failed) {
        try {
          await continuation;
        } catch (cause) {
          failure = cause;
          failed = true;
        }
      } else {
        await continuation.catch(() => undefined);
      }
    }
    if (failed) throw normalizeServiceMiddlewareRejection(failure);
  };
}

function freezePatch<Patch extends ServiceContextPatch>(
  patch: Patch | undefined,
): Patch | undefined {
  if (patch === undefined) return undefined;
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
    throw new ServiceMiddlewarePolicyError("invalid-patch");
  }
  return freezeServiceContextValue(patch, new WeakMap()) as Patch;
}

function rejected<T>(cause: unknown): Promise<T> {
  const promise = Promise.reject(cause);
  void promise.catch(() => undefined);
  return promise;
}

function policyMessage(reason: ServiceMiddlewarePolicyReason): string {
  switch (reason) {
    case "missing-next":
      return "Service middleware must call next exactly once";
    case "duplicate-next":
      return "Service middleware may call next only once";
    case "invalid-patch":
      return "Service middleware context patch must be an object";
  }
}
