import type { MaybePromise } from "@relkit/contracts";

/** Bounded native bucket listing and preview authority; unsupported buckets remain explicit. */
export interface InspectorBucketExplorer {
  readonly supports: (bucketId: string) => MaybePromise<boolean>;
  readonly list: (request: {
    readonly bucketId: string;
    readonly prefix?: string;
    readonly cursor?: string;
    readonly limit: number;
    readonly signal: AbortSignal;
  }) => MaybePromise<{ readonly items: readonly unknown[]; readonly nextCursor?: string }>;
  readonly preview: (request: {
    readonly bucketId: string;
    readonly key: string;
    readonly offset: number;
    readonly limit: number;
    readonly signal: AbortSignal;
  }) => MaybePromise<
    | { readonly bytes: Uint8Array; readonly metadata?: unknown; readonly totalBytes?: number }
    | undefined
  >;
}

/** Bounded native cache scan and value authority with explicit cancellation signals. */
export interface InspectorCacheExplorer {
  readonly supports: (cacheId: string) => MaybePromise<boolean>;
  readonly scan: (request: {
    readonly cacheId: string;
    readonly search?: string;
    readonly cursor?: string;
    readonly limit: number;
    readonly signal: AbortSignal;
  }) => MaybePromise<{ readonly items: readonly unknown[]; readonly nextCursor?: string }>;
  readonly value: (request: {
    readonly cacheId: string;
    readonly key: string;
    readonly limit: number;
    readonly signal: AbortSignal;
  }) => MaybePromise<unknown | undefined>;
}

/** Optional declared native resource explorer authorities. */
export interface InspectorResourceExplorers {
  readonly buckets?: InspectorBucketExplorer;
  readonly cache?: InspectorCacheExplorer;
}
