import { Schema } from "effect";
import type { BucketCapability, BucketOperation } from "./client.types.js";

/** An operation requires a capability absent from the provider.
 * @param capability - Missing capability.
 * @param operation - Attempted operation.
 * @example new BucketCapabilityError("signedReadUrl", "createReadUrl");
 */
export class BucketCapabilityError extends Schema.TaggedError<BucketCapabilityError>()(
  "BucketCapabilityError",
  { capability: Schema.Literals(["signedReadUrl", "signedWriteUrl"]), operation: Schema.String },
) {
  readonly code = "RELKIT_BUCKET_CAPABILITY_UNSUPPORTED" as const;
  constructor(capability: BucketCapability, operation: BucketOperation) {
    super({ capability, operation });
  }
  override get message(): string {
    return `Bucket operation "${this.operation}" requires unsupported capability "${this.capability}"`;
  }
}

/** A function used a bucket without declaring its dependency.
 * @param bucketId - Undeclared bucket identifier.
 * @example new BucketDependencyError("assets");
 */
export class BucketDependencyError extends Schema.TaggedError<BucketDependencyError>()(
  "BucketDependencyError",
  { bucketId: Schema.String },
) {
  readonly code = "RELKIT_BUCKET_DEPENDENCY_UNDECLARED" as const;
  constructor(bucketId: string) {
    super({ bucketId });
  }
  override get message(): string {
    return `Bucket dependency "${this.bucketId}" is not declared on this function`;
  }
}

/** A provider omitted a requested operation.
 * @param operation - Missing provider method.
 * @example new BucketProviderError("get");
 */
export class BucketProviderError extends Schema.TaggedError<BucketProviderError>()(
  "BucketProviderError",
  { operation: Schema.String },
) {
  readonly code = "RELKIT_BUCKET_PROVIDER_UNAVAILABLE" as const;
  constructor(operation: BucketOperation) {
    super({ operation });
  }
  override get name(): string {
    return "ProviderError";
  }
  override get message(): string {
    return `Bucket provider does not implement "${this.operation}"`;
  }
}

/** The caller's signal cancelled a bucket operation.
 * @example new BucketOperationCancelledError();
 */
export class BucketOperationCancelledError extends Schema.TaggedError<BucketOperationCancelledError>()(
  "BucketOperationCancelledError",
  {},
) {
  readonly code = "ABORT_ERR" as const;
  constructor() {
    super({});
  }
  override get name(): string {
    return "AbortError";
  }
  override get message(): string {
    return "Bucket operation cancelled";
  }
}

/** A deadline expired before a bucket operation completed.
 * @example new BucketOperationTimeoutError();
 */
export class BucketOperationTimeoutError extends Schema.TaggedError<BucketOperationTimeoutError>()(
  "BucketOperationTimeoutError",
  {},
) {
  readonly code = "ETIMEDOUT" as const;
  constructor() {
    super({});
  }
  override get name(): string {
    return "TimeoutError";
  }
  override get message(): string {
    return "Bucket operation timed out";
  }
}

/** Provider rejection or malformed provider output.
 * @param fields - Operation and original provider cause.
 * @example new BucketProviderFailureError({ operation: "get", cause: "offline" });
 */
export class BucketProviderFailureError extends Schema.TaggedError<BucketProviderFailureError>()(
  "BucketProviderFailureError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}
