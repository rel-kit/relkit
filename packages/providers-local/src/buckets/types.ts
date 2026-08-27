import type {
  BucketCapabilities,
  BucketCapability,
  BucketObjectMetadata,
  BucketOperation,
  BucketProvider,
} from "@relkit/buckets";

export const LOCAL_BUCKET_CAPABILITIES: Readonly<BucketCapabilities> = Object.freeze({
  signedReadUrl: false,
  signedWriteUrl: false,
});

export const LOCAL_BUCKET_RESERVED_PREFIXES = Object.freeze([".relkit", "__relkit"]);

export interface LocalBucketPolicy {
  readonly maxObjectBytes?: number;
  readonly allowedContentTypes?: readonly string[];
}

export interface LocalBucketProviderOptions extends LocalBucketPolicy {
  readonly root?: string;
  readonly stateRoot?: string;
  readonly policy?: LocalBucketPolicy;
  readonly pageSize?: number;
}

export interface LocalBucketListOptions {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface LocalBucketListPage {
  readonly items: readonly string[];
  readonly nextCursor?: string;
}

export interface LocalBucketObjectMetadata extends BucketObjectMetadata {
  readonly contentHash: string;
}

export interface StoredLocalBucketObject {
  readonly version: 1;
  readonly key: string;
  readonly size: number;
  readonly contentHash: string;
  readonly etag: string;
  readonly contentType?: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly data: string;
}

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

export class LocalBucketKeyError extends TypeError {
  readonly code = "RELKIT_BUCKET_KEY_INVALID" as const;

  constructor() {
    super("Bucket key is invalid");
    this.name = "LocalBucketKeyError";
  }
}

export class LocalBucketPolicyError extends TypeError {
  readonly code = "RELKIT_BUCKET_POLICY_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "LocalBucketPolicyError";
  }
}

export class LocalBucketStateError extends Error {
  readonly code = "RELKIT_BUCKET_STATE_INVALID" as const;

  constructor(message = "Bucket state is invalid") {
    super(message);
    this.name = "LocalBucketStateError";
  }
}

export class LocalBucketPaginationError extends TypeError {
  readonly code = "RELKIT_BUCKET_CURSOR_INVALID" as const;

  constructor() {
    super("Bucket list cursor or limit is invalid");
    this.name = "LocalBucketPaginationError";
  }
}

export type LocalBucketUnsupportedCapability = {
  readonly capability: BucketCapability;
  readonly operation: BucketOperation;
};
