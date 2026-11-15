/**
 * Resolves the limits a declared bucket's client enforces. A bucket's `maxObjectBytes` and
 * `allowedContentTypes` are declared once with `defineBucket` and compiled into the application
 * graph's bucket node. An authored descriptor carries them itself, but a bare reference does not,
 * so a host that holds the graph (the generated server) binds each bucket node's limits to that
 * bucket's source with `bindBucketPolicy`. `createClient` then calls `bucketClientInput`, which
 * unwraps such a source and picks the graph's limits, else the declaration's. A bucket that
 * declares no limits gets no policy, and its source is passed through unchanged, so its client
 * behaves exactly as it did before. Everything here is pure and synchronous.
 */
import type { BucketPolicy } from "../buckets/index.js";

/** A bucket's source paired with the limits the application graph declares for that bucket.
 * @example const bound: PolicyBoundBucketSource = bindBucketPolicy(provider, bucketNode);
 */
export interface PolicyBoundBucketSource {
  /** The provider (or other bucket source) the client calls. */
  readonly source: unknown;
  /** The declared limits the client checks before calling `source`. */
  readonly policy: BucketPolicy;
}

/** Marks a source as graph-bound, so only sources built here are unwrapped. */
class BoundBucketSource implements PolicyBoundBucketSource {
  constructor(
    readonly source: unknown,
    readonly policy: BucketPolicy,
  ) {
    Object.freeze(this);
  }
}

/** Copies the declared limits off a bucket descriptor, reference or graph node.
 * @param value - Declaration or node that may carry limits.
 * @returns A frozen policy, or undefined when the bucket declares no limits.
 */
function declaredPolicy(value: BucketPolicy | undefined): BucketPolicy | undefined {
  const maxObjectBytes = value?.maxObjectBytes;
  const allowedContentTypes = value?.allowedContentTypes;
  if (maxObjectBytes === undefined && allowedContentTypes === undefined) return undefined;
  return Object.freeze({
    ...(maxObjectBytes === undefined ? {} : { maxObjectBytes }),
    ...(allowedContentTypes === undefined ? {} : { allowedContentTypes }),
  });
}

/** Binds the limits a bucket's graph node declares to the source its clients use.
 * @typeParam Source - The bucket's source, usually its provider.
 * @param source - The bucket's source.
 * @param bucket - The bucket's graph node (or descriptor) carrying its declared limits.
 * @returns `source` itself when the bucket declares no limits, else the source bound to them.
 * @example sources.buckets["media.uploads"] = bindBucketPolicy(provider, bucketNode);
 */
export function bindBucketPolicy<Source>(
  source: Source,
  bucket: BucketPolicy & { readonly id: string },
): Source | PolicyBoundBucketSource {
  const policy = declaredPolicy(bucket);
  return policy === undefined ? source : new BoundBucketSource(source, policy);
}

/** Selects the source and limits for one declared bucket client.
 * @param declaration - What the function or handle declared for this bucket, if known.
 * @param source - The bucket's source, possibly bound with `bindBucketPolicy`.
 * @returns The source to call and, when the bucket declares limits, the policy to enforce;
 * the graph's limits win over the declaration's because the compiled graph is the source of truth.
 */
export function bucketClientInput(
  declaration: BucketPolicy | undefined,
  source: unknown,
): { readonly source: unknown; readonly policy?: BucketPolicy } {
  if (source instanceof BoundBucketSource) return { source: source.source, policy: source.policy };
  const policy = declaredPolicy(declaration);
  return policy === undefined ? { source } : { source, policy };
}
