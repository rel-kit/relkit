import type {
  DescriptorBase,
  DescriptorMetadata,
  ProviderProfileName,
} from "../contracts/index.js";
import type { StandardSchemaV1 } from "../schema/index.js";
/** Frozen cache descriptor with phantom key and value types.
 * @example const descriptor = defineCache({ id: "prices", key: z.string(), value: z.number() });
 */
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
/** Any cache descriptor when schema type parameters are not known.
 * @example const value: CacheDescriptorAny = defineCache(options);
 */
export type CacheDescriptorAny = CacheDescriptor<string, unknown, unknown>;
/** Inputs used to define one typed cache contract.
 * @example const options: DefineCacheOptions<"prices", typeof key, typeof value> = { id: "prices", key, value };
 */
export interface DefineCacheOptions<
  Id extends string,
  KeySchema extends StandardSchemaV1,
  ValueSchema extends StandardSchemaV1,
> extends DescriptorMetadata {
  /** Stable, unique name of the cache. */
  readonly id: Id;
  /** The cache provider profile that holds the entries; the application's default when omitted. */
  readonly profile?: ProviderProfileName<"cache">;
  /** Schema of the key that identifies one entry. */
  readonly key: KeySchema;
  /** Schema of the stored value. */
  readonly value: ValueSchema;
  /** Lifetime in milliseconds of an entry whose write does not set one. */
  readonly defaultTtlMs?: number;
  /** Longest lifetime a write may ask for, in milliseconds; a longer one is rejected. */
  readonly maxTtlMs?: number;
}
