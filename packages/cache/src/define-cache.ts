import { createDescriptorBase, deepFreeze, isDescriptor, normalizeId } from "@relkit/contracts";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import { observeCache } from "./client-observability.js";
import { CacheDescriptorError } from "./define-cache-error.js";
import { runDescriptor } from "./define-cache-compat.js";
import type {
  CacheDescriptor,
  CacheDescriptorAny,
  DefineCacheOptions,
} from "./define-cache.types.js";
export type {
  CacheDescriptor,
  CacheDescriptorAny,
  DefineCacheOptions,
} from "./define-cache.types.js";
export { CacheDescriptorError } from "./define-cache-error.js";
/** Defines a typed, frozen cache contract in Effect.
 * @param options - Identifier, schemas, metadata, and TTL policy.
 * @returns A descriptor or a tagged descriptor error.
 * @example Effect.runSync(defineCacheEffect({ id: "prices", key: z.string(), value: z.number() }));
 */
export const defineCacheEffect = Effect.fn("cache.define")(
  <
    const Id extends string,
    const KeySchema extends StandardSchemaV1,
    const ValueSchema extends StandardSchemaV1,
  >(
    options: DefineCacheOptions<Id, KeySchema, ValueSchema>,
  ) =>
    observeCache(
      "define",
      Effect.gen(function* () {
        if (!isRecord(options))
          return yield* new CacheDescriptorError({ reason: "Cache options must be an object" });
        if (hasOwn(options, "handler"))
          return yield* new CacheDescriptorError({ reason: "Caches cannot own handlers" });
        if (!isSchema(options.key))
          return yield* new CacheDescriptorError({
            reason: "key must be a Standard Schema v1 validator",
          });
        if (!isSchema(options.value))
          return yield* new CacheDescriptorError({
            reason: "value must be a Standard Schema v1 validator",
          });
        const profile =
          options.profile === undefined
            ? undefined
            : yield* Effect.try({
                try: () => normalizeId(options.profile),
                catch: (cause) => new CacheDescriptorError({ reason: errorMessage(cause), cause }),
              });
        const defaultTtlMs = yield* validateTtlEffect(options.defaultTtlMs, "defaultTtlMs");
        const maxTtlMs = yield* validateTtlEffect(options.maxTtlMs, "maxTtlMs");
        if (defaultTtlMs !== undefined && maxTtlMs !== undefined && defaultTtlMs > maxTtlMs)
          return yield* new CacheDescriptorError({
            reason: "defaultTtlMs must not exceed maxTtlMs",
          });
        const base = yield* Effect.try({
          try: () => createDescriptorBase("cache", options.id, options),
          catch: (cause) => new CacheDescriptorError({ reason: errorMessage(cause), cause }),
        });
        const descriptor = deepFreeze({
          ...base,
          key: options.key,
          value: options.value,
          ...(profile === undefined ? {} : { profile }),
          ...(defaultTtlMs === undefined ? {} : { defaultTtlMs }),
          ...(maxTtlMs === undefined ? {} : { maxTtlMs }),
        });
        return descriptor as CacheDescriptor<
          Id,
          InferInput<KeySchema>,
          InferOutput<ValueSchema>,
          KeySchema,
          ValueSchema
        >;
      }),
    ),
);
/** Defines a typed cache contract with existing synchronous behavior.
 * @param options - Identifier, schemas, metadata, and TTL policy.
 * @returns A frozen descriptor.
 * @throws TypeError for invalid options and IDs.
 * @example defineCache({ id: "prices", key: z.string(), value: z.number() });
 * @category Resources
 * @since 0.1.0
 */
export function defineCache<
  const Id extends string,
  const KeySchema extends StandardSchemaV1,
  const ValueSchema extends StandardSchemaV1,
>(
  options: DefineCacheOptions<Id, KeySchema, ValueSchema>,
): CacheDescriptor<Id, InferInput<KeySchema>, InferOutput<ValueSchema>, KeySchema, ValueSchema> {
  return runDescriptor(defineCacheEffect(options));
}
/** Checks a possible descriptor without throwing.
 * @param value - Candidate descriptor.
 * @returns Effect of a boolean indicating whether the descriptor is valid.
 * @example Effect.runSync(isCacheDescriptorEffect(value));
 */
export const isCacheDescriptorEffect = Effect.fn("cache.isDescriptor")((value: unknown) =>
  observeCache(
    "isDescriptor",
    Effect.sync(() => checkDescriptor(value)),
  ),
);
/** Checks a possible cache descriptor synchronously.
 * @param value - Candidate descriptor.
 * @returns Whether it is a valid cache descriptor.
 * @example if (isCacheDescriptor(value)) console.log(value.id);
 */
export function isCacheDescriptor(value: unknown): value is CacheDescriptorAny {
  return Effect.runSync(isCacheDescriptorEffect(value));
}
/** Asserts a cache descriptor in Effect.
 * @param value - Candidate descriptor.
 * @returns Void or a tagged descriptor error.
 * @example Effect.runSync(assertCacheDescriptorEffect(value));
 */
export const assertCacheDescriptorEffect = Effect.fn("cache.assertDescriptor")((value: unknown) =>
  observeCache(
    "assertDescriptor",
    Effect.gen(function* () {
      if (!checkDescriptor(value))
        return yield* new CacheDescriptorError({ reason: "Invalid cache descriptor" });
    }),
  ),
);
/** Asserts a cache descriptor synchronously.
 * @param value - Candidate descriptor.
 * @returns Void after narrowing the value.
 * @throws TypeError when the candidate is invalid.
 * @example assertCacheDescriptor(value);
 */
export function assertCacheDescriptor(value: unknown): asserts value is CacheDescriptorAny {
  runDescriptor(assertCacheDescriptorEffect(value));
}
/** Validates one optional descriptor TTL without changing its units. */
const validateTtlEffect = Effect.fn("cache.validateDescriptorTtl")(function* (
  value: number | undefined,
  name: string,
) {
  if (value !== undefined && !isPositiveInteger(value))
    return yield* new CacheDescriptorError({ reason: `${name} must be a positive integer` });
  return value;
});
/** Extracts a useful message from an external contract error. */
function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
/** Recognizes non-array records at descriptor boundaries. */
function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Checks an own key without invoking inherited accessors. */
function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
/** Checks the Standard Schema protocol. */
function isSchema(value: unknown): value is StandardSchemaV1 {
  if (!isRecord(value) || !isRecord(value["~standard"])) return false;
  return value["~standard"].version === 1 && typeof value["~standard"].validate === "function";
}
/** Checks positive integer TTLs. */
function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
/** Validates a profile ID through the shared contract rule. */
function isStableProfile(value: unknown): value is string {
  try {
    normalizeId(value);
    return true;
  } catch {
    return false;
  }
}
/** Pure descriptor predicate shared by observed public guards. */
function checkDescriptor(value: unknown): value is CacheDescriptorAny {
  if (!isRecord(value) || !isDescriptor(value, "cache")) return false;
  const defaultTtlMs = value.defaultTtlMs;
  const maxTtlMs = value.maxTtlMs;
  return (
    isSchema(value.key) &&
    isSchema(value.value) &&
    (value.profile === undefined || isStableProfile(value.profile)) &&
    (defaultTtlMs === undefined || isPositiveInteger(defaultTtlMs)) &&
    (maxTtlMs === undefined || isPositiveInteger(maxTtlMs)) &&
    (defaultTtlMs === undefined || maxTtlMs === undefined || defaultTtlMs <= maxTtlMs)
  );
}
