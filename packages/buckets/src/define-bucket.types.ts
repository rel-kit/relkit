import type { DescriptorBase, DescriptorMetadata } from "@relkit/contracts";

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
  readonly id: Id;
  readonly profile?: string;
  readonly visibility: BucketVisibility;
  readonly maxObjectBytes?: number;
  readonly allowedContentTypes?: readonly string[];
}
