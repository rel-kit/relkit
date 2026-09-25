import type { DescriptorBase, DescriptorMetadata } from "@relkit/contracts";
import type { StandardSchemaV1 } from "@relkit/schema";
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
  readonly id: Id;
  readonly profile?: string;
  readonly key: KeySchema;
  readonly value: ValueSchema;
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
}
