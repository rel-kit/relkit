import {
  createDescriptorBase,
  deepFreeze,
  isDescriptor,
  normalizeId,
  type DescriptorBase,
  type DescriptorMetadata,
} from "@zsys/contracts";
import { type InferInput, type InferOutput, type StandardSchemaV1 } from "@zsys/schema";

export interface CacheDescriptor<
  Id extends string,
  Key,
  Value,
  KeySchema extends StandardSchemaV1 = StandardSchemaV1,
  ValueSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends DescriptorBase<"cache", Id> {
  readonly profile?: string;
  readonly key: KeySchema;
  readonly value: ValueSchema;
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
  readonly __key?: Key;
  readonly __value?: Value;
}

export type CacheDescriptorAny = CacheDescriptor<string, unknown, unknown>;

export interface DefineCacheOptions<
  Id extends string,
  KeySchema extends StandardSchemaV1,
  ValueSchema extends StandardSchemaV1,
> extends DescriptorMetadata {
  readonly id: Id;
  readonly profile?: string;
  readonly key: KeySchema;
  readonly value: ValueSchema;
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
}

/**
 * Defines a typed cache contract with validated key/value schemas and TTL bounds.
 *
 * @example
 * ```ts
 * import { defineCache } from "@zsys/cache"
 * import { z } from "@zsys/schema"
 *
 * const prices = defineCache({ id: "prices", key: z.string(), value: z.number(), defaultTtlMs: 60_000 })
 * void prices
 * ```
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
  if (!isRecord(options)) throw new TypeError("Cache options must be an object");
  if (hasOwn(options, "handler")) throw new TypeError("Caches cannot own handlers");
  assertSchema(options.key, "key");
  assertSchema(options.value, "value");

  const profile = options.profile === undefined ? undefined : normalizeId(options.profile);
  const defaultTtlMs = validateTtl(options.defaultTtlMs, "defaultTtlMs");
  const maxTtlMs = validateTtl(options.maxTtlMs, "maxTtlMs");
  if (defaultTtlMs !== undefined && maxTtlMs !== undefined && defaultTtlMs > maxTtlMs) {
    throw new TypeError("defaultTtlMs must not exceed maxTtlMs");
  }
  const base = createDescriptorBase("cache", options.id, options);

  return deepFreeze({
    ...base,
    key: options.key,
    value: options.value,
    ...(profile === undefined ? {} : { profile }),
    ...(defaultTtlMs === undefined ? {} : { defaultTtlMs }),
    ...(maxTtlMs === undefined ? {} : { maxTtlMs }),
  }) as CacheDescriptor<
    Id,
    InferInput<KeySchema>,
    InferOutput<ValueSchema>,
    KeySchema,
    ValueSchema
  >;
}

export function isCacheDescriptor(value: unknown): value is CacheDescriptorAny {
  if (!isRecord(value) || !isDescriptor(value, "cache")) return false;
  const descriptor = value as CacheDescriptorAny;
  const defaultTtlMs = descriptor.defaultTtlMs;
  const maxTtlMs = descriptor.maxTtlMs;
  return (
    isSchema(descriptor.key) &&
    isSchema(descriptor.value) &&
    (descriptor.profile === undefined || isStableProfile(descriptor.profile)) &&
    (defaultTtlMs === undefined || isPositiveInteger(defaultTtlMs)) &&
    (maxTtlMs === undefined || isPositiveInteger(maxTtlMs)) &&
    (defaultTtlMs === undefined || maxTtlMs === undefined || defaultTtlMs <= maxTtlMs)
  );
}

export function assertCacheDescriptor(value: unknown): asserts value is CacheDescriptorAny {
  if (!isCacheDescriptor(value)) throw new TypeError("Invalid cache descriptor");
}

function validateTtl(value: number | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!isPositiveInteger(value)) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

function assertSchema(value: unknown, name: string): asserts value is StandardSchemaV1 {
  if (!isSchema(value)) throw new TypeError(`${name} must be a Standard Schema v1 validator`);
}

function isSchema(value: unknown): value is StandardSchemaV1 {
  if (!isRecord(value) || !isRecord(value["~standard"])) return false;
  return value["~standard"].version === 1 && typeof value["~standard"].validate === "function";
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isStableProfile(value: unknown): value is string {
  try {
    normalizeId(value);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
