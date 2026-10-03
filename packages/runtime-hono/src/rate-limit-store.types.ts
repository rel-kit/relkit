import type { MaybePromise } from "@relkit/contracts";

/** Contract for rate limit counter used by rate limit store. */
export interface RateLimitCounter {
  readonly get: (key: string) => MaybePromise<unknown | undefined>;
  readonly increment: (
    key: string,
    delta: number,
    options?: { readonly ttlMs?: number },
  ) => MaybePromise<unknown>;
  readonly delete: (key: string) => MaybePromise<void>;
}

/** Contract for rate limit store resolver used by rate limit store. */
export type RateLimitStoreResolver = (storeId: string) => MaybePromise<RateLimitCounter>;

/** Contract for window location used by rate limit store. */
export interface WindowLocation {
  readonly key: string;
  readonly resetAt: number;
  readonly ttlMs: number;
}
