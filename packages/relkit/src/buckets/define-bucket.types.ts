import type {
  DescriptorBase,
  DescriptorMetadata,
  ProviderProfileName,
} from "../contracts/index.js";

/** Visibility policy for a bucket.
 * @example const visibility: BucketVisibility = "private";
 */
export type BucketVisibility = "private" | "public";

/** Immutable authored bucket descriptor.
 * @example const bucket: BucketDescriptor<"assets"> = defineBucket({ id: "assets", visibility: "private" });
 */
export interface BucketDescriptor<Id extends string> extends DescriptorBase<"bucket", Id> {
  readonly profile?: string;
  readonly visibility: BucketVisibility;
  readonly maxObjectBytes?: number;
  readonly allowedContentTypes?: readonly string[];
}

/** Bucket descriptor with an arbitrary stable identifier.
 * @example const bucket: BucketDescriptorAny = defineBucket({ id: "assets", visibility: "private" });
 */
export type BucketDescriptorAny = BucketDescriptor<string>;

/** Input accepted when defining a bucket.
 * @example const options: DefineBucketOptions<"assets"> = { id: "assets", visibility: "private" };
 */
export interface DefineBucketOptions<Id extends string> extends DescriptorMetadata {
  /** Stable, unique name of the bucket; keep it when the file moves or is renamed. */
  readonly id: Id;
  /** The bucket provider profile that stores the objects; the application's default when omitted. */
  readonly profile?: ProviderProfileName<"bucket">;
  /** Whether stored objects are `"private"` or readable by anyone (`"public"`). */
  readonly visibility: BucketVisibility;
  /** Largest size of one stored object, in bytes. */
  readonly maxObjectBytes?: number;
  /** Media types the bucket accepts, such as `image/*`; any type when omitted. */
  readonly allowedContentTypes?: readonly string[];
}
