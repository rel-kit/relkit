import type { BucketClient } from "@relkit/buckets";

/** Native dependency facade retained to prove implicit invocation storage ownership. */
export interface DetachedInvocationContext {
  readonly signal: AbortSignal;
  readonly buckets: { readonly assets: BucketClient };
}
