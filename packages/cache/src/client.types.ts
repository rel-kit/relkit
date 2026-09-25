import type { MaybePromise } from "@relkit/contracts";
import type { StandardSchemaV1 } from "@relkit/schema";
import type { Effect } from "effect";
import type { CacheOperationOptions } from "./client-operation.types.js";
import type { CacheObservedEdge, CacheOperationObservation } from "./client-observability.types.js";
import type { CacheInvocationBridge } from "./client-runtime.types.js";
import type {
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
export type {
  CacheCapability,
  CacheCapabilities,
  CacheOperation,
  CacheOperationContext,
  CacheOperationOptions,
  CacheOperationOutcome,
  CacheProvider,
} from "./client-operation.types.js";
/** Promise methods retained for existing callers.
 * @example const value = await client.get("sku");
 */
export interface CacheClientBase<Key, Value> {
  /** Reads one decoded value.
   * @param key - Cache key.
   * @returns Value or undefined, or a rejected cache error.
   * @example await client.get("sku");
   */
  get(key: Key): Promise<Value | undefined>;
  /** Writes a value.
   * @param key - Cache key.
   * @param value - Value to store.
   * @param options - Optional TTL.
   * @returns Completion or a rejected cache error.
   * @example await client.set("sku", 1);
   */
  set(key: Key, value: Value, options?: CacheOperationOptions): Promise<void>;
  /** Removes one entry.
   * @param key - Cache key.
   * @returns Completion or a rejected cache error.
   * @example await client.delete("sku");
   */
  delete(key: Key): Promise<void>;
  /** Tests whether a key exists.
   * @param key - Cache key.
   * @returns Presence or a rejected cache error.
   * @example await client.has("sku");
   */
  has(key: Key): Promise<boolean>;
  /** Reads or produces one value.
   * @param key - Cache key.
   * @param produce - Called only on a cache miss.
   * @param options - Optional TTL.
   * @returns Value or a rejected cache error.
   * @example await client.getOrSet("sku", () => 1);
   */
  getOrSet(
    key: Key,
    produce: () => MaybePromise<Value>,
    options?: CacheOperationOptions,
  ): Promise<Value>;
}
/** Increment method exposed for numeric value contracts.
 * @example await numericClient.increment("sku", 2);
 */
export type CacheNumericClient<Key, Value extends number> = {
  /** Increments a numeric value.
   * @param key - Cache key.
   * @param delta - Finite increment.
   * @param options - Optional TTL.
   * @returns Updated value or a rejected cache error.
   * @example await numericClient.increment("sku", 2);
   */
  increment(key: Key, delta?: number, options?: CacheOperationOptions): Promise<Value>;
};
/** Promise client with increment exposed only for numeric value types.
 * @example const value = await client.get("sku");
 */
export type CacheClient<Key, Value> = CacheClientBase<Key, Value> &
  ([Value] extends [number] ? CacheNumericClient<Key, Value> : object);
/** Expected failures from a cache Effect operation.
 * @example Effect.catchTag("CacheProviderError", (error) => Effect.log(error.message));
 */
export type CacheOperationError =
  | CacheCapabilityError
  | CacheDependencyError
  | CacheIncrementUnsupportedError
  | CacheOperationCancelledError
  | CacheOperationTimeoutError
  | CacheProviderError
  | CacheProviderFailureError
  | CacheSchemaValidationError
  | CacheTtlPolicyError
  | CacheValidationError;
/** Effect-first cache operations; each call can be composed or provided with a test Layer.
 * @example const value = await Effect.runPromise(client.get("sku"));
 */
export interface CacheEffectClient<Key, Value> {
  /** Reads a key.
   * @param key - Cache key.
   * @returns Effect of value, undefined, or CacheOperationError.
   * @example client.get("sku");
   */
  get(key: Key): Effect.Effect<Value | undefined, CacheOperationError>;
  /** Writes a value.
   * @param key - Cache key.
   * @param value - Value to store.
   * @param options - Optional TTL.
   * @returns Effect of void or CacheOperationError.
   * @example client.set("sku", 1);
   */
  set(
    key: Key,
    value: Value,
    options?: CacheOperationOptions,
  ): Effect.Effect<void, CacheOperationError>;
  /** Deletes one key.
   * @param key - Cache key.
   * @returns Effect of void or CacheOperationError.
   * @example client.delete("sku");
   */
  delete(key: Key): Effect.Effect<void, CacheOperationError>;
  /** Tests for a key.
   * @param key - Cache key.
   * @returns Effect of boolean or CacheOperationError.
   * @example client.has("sku");
   */
  has(key: Key): Effect.Effect<boolean, CacheOperationError>;
  /** Reads or produces a value.
   * @param key - Cache key.
   * @param produce - Miss producer.
   * @param options - Optional TTL.
   * @returns Effect of value or CacheOperationError.
   * @example client.getOrSet("sku", () => 1);
   */
  getOrSet(
    key: Key,
    produce: () => MaybePromise<Value>,
    options?: CacheOperationOptions,
  ): Effect.Effect<Value, CacheOperationError>;
  /** Increments a numeric value.
   * @param key - Cache key.
   * @param delta - Finite increment.
   * @param options - Optional TTL.
   * @returns Effect of number or CacheOperationError.
   * @example client.increment("sku", 2);
   */
  increment(
    key: Key,
    delta?: number,
    options?: CacheOperationOptions,
  ): Effect.Effect<number, CacheOperationError>;
}
export type { CacheBridgeOptions, CacheInvocationBridge } from "./client-runtime.types.js";
export type { CacheObservedEdge, CacheOperationObservation } from "./client-observability.types.js";
/** Descriptor schema and TTL defaults used by a client.
 * @example const policy: CacheDescriptorPolicy = { defaultTtlMs: 1000 };
 */
export interface CacheDescriptorPolicy {
  readonly key?: StandardSchemaV1;
  readonly value?: StandardSchemaV1;
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
}
/** Client configuration and advisory observation hooks.
 * @example const options: CacheClientOptions = { ownerId: "orders", cacheId: "prices", source: {} };
 */
export interface CacheClientOptions<
  KeySchema extends StandardSchemaV1 = StandardSchemaV1,
  ValueSchema extends StandardSchemaV1 = StandardSchemaV1,
> {
  readonly ownerId: string;
  readonly cacheId: string;
  readonly source: unknown;
  readonly keySchema?: KeySchema;
  readonly valueSchema?: ValueSchema;
  readonly key?: KeySchema;
  readonly value?: ValueSchema;
  readonly descriptor?: CacheDescriptorPolicy;
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
  readonly bridge?: CacheInvocationBridge;
  readonly signal?: () => AbortSignal;
  readonly deadline?: () => number | undefined;
  readonly declared?: boolean;
  readonly onObservedEdge?: (edge: CacheObservedEdge) => void;
  readonly onOperation?: (operation: CacheOperationObservation) => void;
}
