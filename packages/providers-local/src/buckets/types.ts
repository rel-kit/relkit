import type {
  LocalBucketPolicy,
  LocalBucketProviderOptions,
  LocalBucketListOptions,
  LocalBucketListPage,
  LocalBucketObjectMetadata,
  StoredLocalBucketObject,
  LocalBucketProvider,
  LocalBucketUnsupportedCapability,
} from "./buckets.types.js";
import type { BucketCapabilities } from "@relkit/buckets";

export type {
  LocalBucketPolicy,
  LocalBucketProviderOptions,
  LocalBucketListOptions,
  LocalBucketListPage,
  LocalBucketObjectMetadata,
  StoredLocalBucketObject,
  LocalBucketProvider,
  LocalBucketUnsupportedCapability,
} from "./buckets.types.js";

export const LOCAL_BUCKET_CAPABILITIES: Readonly<BucketCapabilities> = Object.freeze({
  signedReadUrl: false,
  signedWriteUrl: false,
});

export const LOCAL_BUCKET_RESERVED_PREFIXES = Object.freeze([".relkit", "__relkit"]);

/** Preserves the public local bucket key error identity and stable error code. */
export class LocalBucketKeyError extends TypeError {
  readonly code = "RELKIT_BUCKET_KEY_INVALID" as const;

  constructor() {
    super("Bucket key is invalid");
    this.name = "LocalBucketKeyError";
  }
}

/** Preserves the public local bucket policy error identity and stable error code. */
export class LocalBucketPolicyError extends TypeError {
  readonly code = "RELKIT_BUCKET_POLICY_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "LocalBucketPolicyError";
  }
}

/** Preserves the public local bucket state error identity and stable error code. */
export class LocalBucketStateError extends Error {
  readonly code = "RELKIT_BUCKET_STATE_INVALID" as const;

  constructor(message = "Bucket state is invalid") {
    super(message);
    this.name = "LocalBucketStateError";
  }
}

/** Preserves the public local bucket pagination error identity and stable error code. */
export class LocalBucketPaginationError extends TypeError {
  readonly code = "RELKIT_BUCKET_CURSOR_INVALID" as const;

  constructor() {
    super("Bucket list cursor or limit is invalid");
    this.name = "LocalBucketPaginationError";
  }
}
