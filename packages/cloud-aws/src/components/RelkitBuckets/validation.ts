import { normalizeId } from "@relkit/contracts";
import type { RelkitBucketDefinition, RelkitBucketsArgs } from "./types.js";

export interface NormalizedBucket {
  readonly id: string;
  readonly visibility: "private" | "public";
  readonly bucketName?: RelkitBucketDefinition["bucketName"];
  readonly forceDestroy?: RelkitBucketDefinition["forceDestroy"];
  readonly versioned?: RelkitBucketDefinition["versioned"];
}

export function normalizeBuckets(args: RelkitBucketsArgs): readonly NormalizedBucket[] {
  const ids = new Set<string>();
  return args.buckets.map((definition) => {
    const id = normalizeId(definition.id);
    if (!ids.add(id)) throw new TypeError(`Duplicate AWS bucket "${id}".`);
    const visibility = definition.visibility ?? "private";
    if (visibility !== "private" && visibility !== "public")
      throw new TypeError(`AWS bucket "${id}" visibility is invalid.`);
    if (typeof definition.bucketName === "string" && definition.bucketName.trim() === "")
      throw new TypeError(`AWS bucket "${id}" bucketName must not be empty.`);
    return {
      id,
      visibility,
      ...(definition.bucketName === undefined ? {} : { bucketName: definition.bucketName }),
      ...(definition.forceDestroy === undefined ? {} : { forceDestroy: definition.forceDestroy }),
      ...(definition.versioned === undefined ? {} : { versioned: definition.versioned }),
    };
  });
}
