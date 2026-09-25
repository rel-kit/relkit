import type { MaybePromise } from "@relkit/contracts";
import { Cause, Effect, Exit } from "effect";
import {
  BucketOperationCancelledError,
  BucketOperationTimeoutError,
  BucketProviderError,
  BucketProviderFailureError,
} from "./client-errors.js";
import {
  type BucketCapability,
  type BucketOperation,
  type BucketOperationOutcome,
  type BucketProvider,
} from "./client.types.js";

/** Requires an optional provider method in Effect.
 * @param value - Optional implementation.
 * @param operation - Method name for errors.
 * @returns Effect of the implementation or BucketProviderError.
 * @example Effect.runSync(requiredEffect(provider.get, "get"));
 */
export const requiredEffect = Effect.fn("bucket.required")(
  <A>(value: ((...args: any[]) => MaybePromise<A>) | undefined, operation: BucketOperation) =>
    Effect.gen(function* () {
      if (value === undefined) return yield* new BucketProviderError(operation);
      return value;
    }),
);

/** Synchronous compatibility adapter for a required provider method.
 * @param value - Optional implementation.
 * @param operation - Method name for errors.
 * @returns The implementation.
 * @throws BucketProviderError when absent.
 * @example required(provider.get, "get")("a");
 */
export function required<A>(
  value: ((...args: any[]) => MaybePromise<A>) | undefined,
  operation: BucketOperation,
): (...args: any[]) => MaybePromise<A> {
  const exit = Effect.runSyncExit(requiredEffect(value, operation));
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}

/** Checks provider-advertised capabilities in Effect.
 * @param value - Capability flags or names.
 * @param capability - Capability to test.
 * @returns Effect of a support flag.
 * @example Effect.runSync(supportsEffect(provider.capabilities, "signedReadUrl"));
 */
export const supportsEffect = Effect.fn("bucket.supports")(
  (value: BucketProvider["capabilities"], capability: BucketCapability) =>
    Effect.sync(() =>
      Array.isArray(value)
        ? value.includes(capability)
        : (value as import("./client.types.js").BucketCapabilities | undefined)?.[capability] ===
          true,
    ),
);

/** Classifies a provider or cancellation failure in Effect.
 * @param value - Unknown failure.
 * @returns Effect of a fixed outcome label.
 * @example Effect.runSync(classifyEffect(new BucketOperationCancelledError()));
 */
export const classifyEffect = Effect.fn("bucket.classify")((value: unknown) =>
  Effect.sync((): BucketOperationOutcome => {
    let cause = value;
    while (cause instanceof BucketProviderFailureError) cause = cause.cause;
    const name = (cause as { name?: unknown })?.name;
    if (cause instanceof BucketOperationCancelledError || name === "AbortError") return "cancelled";
    if (cause instanceof BucketOperationTimeoutError || name === "TimeoutError") return "timeout";
    return "provider-failure";
  }),
);

/** Calls an advisory hook without letting it affect provider behavior.
 * @param hook - Optional observer.
 * @param value - Frozen observation payload.
 * @returns Effect of void; hook defects are ignored.
 * @example Effect.runSync(notifyEffect((value) => console.log(value), "ready"));
 */
export const notifyEffect = Effect.fn("bucket.notify")(
  <T>(hook: ((value: T) => void) | undefined, value: T) =>
    Effect.sync(() => {
      try {
        hook?.(Object.freeze(value));
      } catch {
        // Hooks are advisory and cannot change provider behavior.
      }
    }),
);
