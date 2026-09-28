import { Cause, Effect, Exit } from "effect";
import { runAbortableEffect } from "./client-abort.js";
import {
  CacheCapabilityError,
  CacheDependencyError,
  CacheIncrementUnsupportedError,
  CacheOperationCancelledError,
  CacheOperationTimeoutError,
  CacheProviderError,
  CacheProviderFailureError,
  CacheSchemaValidationError,
  CacheTtlPolicyError,
  CacheValidationError,
} from "./client-errors.js";
import { CacheRuntime } from "./client-runtime.js";
import type { CacheInvocation } from "./client-operation.types.js";
import type {
  CacheOperation,
  CacheOperationError,
  CacheOperationOutcome,
  CacheProvider,
} from "./client.types.js";
/** Invokes an optional provider method in the typed error channel.
 * @param operation - Fixed method name.
 * @param method - Optional provider method.
 * @param args - Validated arguments passed to the method.
 * @returns Provider value or a tagged unavailable/failure error.
 * @example Effect.runPromise(invokeProvider("get", async () => 1, ["sku"]));
 */
export const invokeProvider = Effect.fn("cache.invokeProvider")(
  <A>(
    operation: CacheOperation,
    method: ((...args: any[]) => A | PromiseLike<A>) | undefined,
    args: unknown[],
  ) =>
    Effect.tryPromise({
      try: () => {
        if (method === undefined) throw new CacheProviderError(operation);
        return Promise.resolve(method(...args));
      },
      catch: (cause) =>
        isCacheOperationError(cause) ? cause : new CacheProviderFailureError({ operation, cause }),
    }),
);
/** Executes provider work with injectable runtime, bridge, cancellation, and hooks.
 * @param invocation - Fixed operation and Effect work.
 * @returns Work result or its tagged Effect failure.
 * @example Effect.provide(runCacheOperation({ operation: "get", input: {}, work: () => Effect.succeed(1) }), layer);
 */
export const runCacheOperation = Effect.fn("cache.operation")(<A>(invocation: CacheInvocation<A>) =>
  Effect.gen(function* () {
    const { options, provider } = yield* CacheRuntime;
    const signal = options.signal?.() ?? new AbortController().signal;
    const deadlineMs = options.deadline?.();
    if (options.declared !== false)
      notify(options.onObservedEdge, {
        relationship: "uses-cache",
        from: options.ownerId,
        to: options.cacheId,
      });
    const execute = (operationSignal: AbortSignal) =>
      Effect.gen(function* () {
        if (options.declared === false) return yield* new CacheDependencyError(options.cacheId);
        if (invocation.capability !== undefined && !supports(provider, invocation.capability))
          return yield* new CacheCapabilityError(invocation.capability, invocation.operation);
        return yield* invocation.work(provider, {
          operation: invocation.operation,
          signal: operationSignal,
          ...(deadlineMs === undefined ? {} : { deadlineMs }),
        });
      });
    const bridge = options.bridge;
    const work =
      bridge === undefined
        ? Effect.acquireUseRelease(
            Effect.sync(() => new AbortController()),
            (controller) => runAbortableEffect(signal, deadlineMs, execute(controller.signal)),
            (controller) => Effect.sync(() => controller.abort()),
          )
        : Effect.acquireUseRelease(
            Effect.sync(() => new AbortController()),
            (controller) =>
              runAbortableEffect(
                signal,
                deadlineMs,
                Effect.tryPromise({
                  try: (effectSignal) =>
                    bridge.run(
                      () =>
                        effectSignal.aborted
                          ? Promise.reject(new CacheOperationCancelledError())
                          : Effect.runPromise(execute(controller.signal), { signal: effectSignal }),
                      {
                        name: `relkit.cache.${invocation.operation}`,
                        attributes: {
                          "relkit.cache.operation": invocation.operation,
                        },
                        signal,
                        input: invocation.input,
                      },
                    ),
                  catch: (cause) =>
                    isCacheOperationError(cause)
                      ? cause
                      : new CacheProviderFailureError({ operation: invocation.operation, cause }),
                }),
              ),
            (controller) => Effect.sync(() => controller.abort()),
          );
    return yield* Effect.onExit(work, (exit) =>
      Effect.sync(() => {
        const outcome = Exit.isSuccess(exit)
          ? "success"
          : Cause.hasInterruptsOnly(exit.cause)
            ? "cancelled"
            : classify(Cause.squash(exit.cause));
        notify(options.onOperation, {
          capability: "cache",
          operation: invocation.operation,
          ownerId: options.ownerId,
          cacheId: options.cacheId,
          outcome: outcome satisfies CacheOperationOutcome,
        });
      }),
    );
  }),
);
/** Recognizes only declared cache failures when a bridge rejects. */
function isCacheOperationError(value: unknown): value is CacheOperationError {
  return (
    value instanceof CacheCapabilityError ||
    value instanceof CacheDependencyError ||
    value instanceof CacheIncrementUnsupportedError ||
    value instanceof CacheOperationCancelledError ||
    value instanceof CacheOperationTimeoutError ||
    value instanceof CacheProviderError ||
    value instanceof CacheProviderFailureError ||
    value instanceof CacheSchemaValidationError ||
    value instanceof CacheTtlPolicyError ||
    value instanceof CacheValidationError
  );
}
/** Tests a fixed provider capability without mutating provider state. */
function supports(provider: CacheProvider, capability: "increment"): boolean {
  const value = provider.capabilities;
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.includes(capability);
  return (value as { increment?: boolean }).increment === true;
}
/** Maps typed failures to the stable compatibility observation outcome. */
function classify(value: unknown): CacheOperationOutcome {
  const cause = value instanceof CacheProviderFailureError ? value.cause : value;
  const name = (cause as { name?: unknown })?.name;
  if (value instanceof CacheSchemaValidationError) return "validation-error";
  if (value instanceof CacheCapabilityError || value instanceof CacheIncrementUnsupportedError)
    return "unsupported";
  if (value instanceof CacheOperationCancelledError || name === "AbortError") return "cancelled";
  if (value instanceof CacheOperationTimeoutError || name === "TimeoutError") return "timeout";
  return "provider-failure";
}
/** Calls advisory hooks without allowing them to change cache behavior. */
function notify<T>(hook: ((value: T) => void) | undefined, value: T): void {
  try {
    hook?.(Object.freeze(value));
  } catch {
    /* Advisory hooks are best effort. */
  }
}
