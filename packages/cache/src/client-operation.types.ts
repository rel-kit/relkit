import type { Effect } from "effect";
import type { MaybePromise } from "@relkit/contracts";
import type { CacheOperationError } from "./client.types.js";
/** Fixed cache method names used for spans and metrics.
 * @example const operation: CacheOperation = "get";
 */
export type CacheOperation = "get" | "set" | "delete" | "has" | "getOrSet" | "increment";
/** Provider feature negotiated before executing an operation.
 * @example const capability: CacheCapability = "increment";
 */
export type CacheCapability = "increment";
/** Stable operation outcomes for RELKIT observations.
 * @example const outcome: CacheOperationOutcome = "success";
 */
export type CacheOperationOutcome =
  "success" | "provider-failure" | "cancelled" | "timeout" | "unsupported" | "validation-error";
/** Optional write or increment TTL in milliseconds.
 * @example const options: CacheOperationOptions = { ttlMs: 1000 };
 */
export interface CacheOperationOptions {
  readonly ttlMs?: number;
}
/** Cancellation and deadline data passed to a provider call.
 * @example const context: CacheOperationContext = { operation: "get", signal: new AbortController().signal };
 */
export interface CacheOperationContext {
  readonly operation: CacheOperation;
  readonly signal: AbortSignal;
  readonly deadlineMs?: number;
}
/** Provider-declared feature support.
 * @example const capabilities: CacheCapabilities = { increment: true };
 */
export interface CacheCapabilities {
  readonly increment?: boolean;
}
/** Optional provider methods; missing methods fail with CacheProviderError.
 * @example const provider: CacheProvider = { get: async () => undefined };
 */
export interface CacheProvider {
  readonly capabilities?: CacheCapabilities | readonly CacheCapability[];
  /** Reads one key.
   * @param key - Provider key.
   * @param context - Cancellation and deadline context.
   * @returns Stored value or undefined.
   * @example await provider.get?.("sku", context);
   */
  readonly get?: (
    key: unknown,
    context?: CacheOperationContext,
  ) => MaybePromise<unknown | undefined>;
  /** Writes one entry.
   * @param key - Provider key.
   * @param value - Validated value.
   * @param options - Optional TTL.
   * @param context - Cancellation and deadline context.
   * @returns Completion.
   * @example await provider.set?.("sku", 1);
   */
  readonly set?: (
    key: unknown,
    value: unknown,
    options?: CacheOperationOptions,
    context?: CacheOperationContext,
  ) => MaybePromise<void>;
  /** Deletes one key.
   * @param key - Provider key.
   * @param context - Cancellation and deadline context.
   * @returns Completion.
   * @example await provider.delete?.("sku");
   */
  readonly delete?: (key: unknown, context?: CacheOperationContext) => MaybePromise<void>;
  /** Tests key presence.
   * @param key - Provider key.
   * @param context - Cancellation and deadline context.
   * @returns Presence.
   * @example await provider.has?.("sku");
   */
  readonly has?: (key: unknown, context?: CacheOperationContext) => MaybePromise<boolean>;
  /** Reads or fills a key.
   * @param key - Provider key.
   * @param produce - Miss producer.
   * @param options - Optional TTL.
   * @param context - Cancellation and deadline context.
   * @returns Stored or produced value.
   * @example await provider.getOrSet?.("sku", () => 1);
   */
  readonly getOrSet?: (
    key: unknown,
    produce: () => MaybePromise<unknown>,
    options?: CacheOperationOptions,
    context?: CacheOperationContext,
  ) => MaybePromise<unknown>;
  /** Increments a numeric entry.
   * @param key - Provider key.
   * @param delta - Finite increment.
   * @param options - Optional TTL.
   * @param context - Cancellation and deadline context.
   * @returns Updated numeric value.
   * @example await provider.increment?.("sku", 2);
   */
  readonly increment?: (
    key: unknown,
    delta: number,
    options?: CacheOperationOptions,
    context?: CacheOperationContext,
  ) => MaybePromise<unknown>;
}
/** Provider invocation and its typed Effect work.
 * @example const invocation: CacheInvocation<number> = { operation: "get", input: {}, work: () => Effect.succeed(1) };
 */
export interface CacheInvocation<A> {
  readonly operation: CacheOperation;
  readonly input: unknown;
  readonly capability?: "increment";
  /** Builds validated provider work inside the cache runtime.
   * @param provider - Injected provider.
   * @param context - Cancellation and deadline context.
   * @returns Effect of the operation result or a typed cache failure.
   * @example invocation.work(provider, context);
   */
  readonly work: (
    provider: CacheProvider,
    context: CacheOperationContext,
  ) => Effect.Effect<A, CacheOperationError>;
}
