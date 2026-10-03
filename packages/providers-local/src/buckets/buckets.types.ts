import type {
  BucketCapabilities,
  BucketCapability,
  BucketObjectMetadata,
  BucketOperation,
  BucketProvider,
} from "@relkit/buckets";
import type { StoredBucketObject } from "./storage.schemas.js";

/** Size, content-type and metadata limits enforced before bucket writes. */
export interface LocalBucketPolicy {
  readonly maxObjectBytes?: number;
  readonly allowedContentTypes?: readonly string[];
}

/** Owned root, object policy and default pagination settings for a local bucket. */
export interface LocalBucketProviderOptions extends LocalBucketPolicy {
  readonly root?: string;
  readonly stateRoot?: string;
  readonly policy?: LocalBucketPolicy;
  readonly pageSize?: number;
}

/** Optional cursor and bounded page size for lexical key listing. */
export interface LocalBucketListOptions {
  readonly cursor?: string;
  readonly limit?: number;
}

/** Immutable bucket key page with continuation metadata. */
export interface LocalBucketListPage {
  readonly items: readonly string[];
  readonly nextCursor?: string;
}

/** Verified content identity, size and optional application metadata. */
export interface LocalBucketObjectMetadata extends BucketObjectMetadata {
  readonly contentHash: string;
}

/** Versioned object envelope storing verified bytes as base64. */
export type StoredLocalBucketObject = typeof StoredBucketObject.Type;

/** Public Promise bucket contract plus local inspection and lifecycle operations. */
export type LocalBucketProvider = Omit<BucketProvider, "list"> & {
  readonly capabilities: Readonly<BucketCapabilities>;
  readonly root: string;
  readonly policy: Readonly<LocalBucketPolicy>;
  readonly list: {
    (prefix?: string): Promise<readonly string[]>;
    (prefix: string | undefined, options: LocalBucketListOptions): Promise<LocalBucketListPage>;
  };
  readonly listPage: (
    prefix?: string,
    options?: LocalBucketListOptions,
  ) => Promise<LocalBucketListPage>;
  readonly ready: () => Promise<void>;
  readonly close: () => Promise<void>;
  readonly inspector: {
    readonly list: (request: {
      readonly prefix?: string;
      readonly cursor?: string;
      readonly limit: number;
      readonly signal: AbortSignal;
    }) => Promise<{
      readonly items: readonly { readonly key: string; readonly metadata?: BucketObjectMetadata }[];
      readonly nextCursor?: string;
    }>;
    readonly preview: (request: {
      readonly key: string;
      readonly offset: number;
      readonly limit: number;
      readonly signal: AbortSignal;
    }) => Promise<
      | {
          readonly bytes: Uint8Array;
          readonly metadata: BucketObjectMetadata;
          readonly totalBytes: number;
        }
      | undefined
    >;
  };
};

/** Bucket capability that the filesystem implementation explicitly does not provide. */
export type LocalBucketUnsupportedCapability = {
  readonly capability: BucketCapability;
  readonly operation: BucketOperation;
};
