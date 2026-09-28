import { Schema } from "effect";
import type { StandardIssue } from "@relkit/schema";
import type { CacheCapability, CacheOperation } from "./client.types.js";
/** The provider lacks a declared cache capability.
 * @param capability - Missing capability.
 * @param operation - Attempted operation.
 * @example new CacheCapabilityError("increment", "increment");
 */
export class CacheCapabilityError extends Schema.TaggedError<CacheCapabilityError>()(
  "CacheCapabilityError",
  { capability: Schema.String, operation: Schema.String },
) {
  readonly code = "RELKIT_CACHE_CAPABILITY_UNSUPPORTED" as const;
  constructor(capability: CacheCapability, operation: CacheOperation) {
    super({ capability, operation });
  }
  override get message(): string {
    return `Cache operation "${this.operation}" requires unsupported capability "${this.capability}"`;
  }
}
/** A function used an undeclared cache.
 * @param cacheId - Cache identifier.
 * @example new CacheDependencyError("prices");
 */
export class CacheDependencyError extends Schema.TaggedError<CacheDependencyError>()(
  "CacheDependencyError",
  { cacheId: Schema.String },
) {
  readonly code = "RELKIT_CACHE_DEPENDENCY_UNDECLARED" as const;
  constructor(cacheId: string) {
    super({ cacheId });
  }
  override get message(): string {
    return `Cache dependency "${this.cacheId}" is not declared on this function`;
  }
}
/** The provider omits an operation.
 * @param operation - Missing operation.
 * @example new CacheProviderError("get");
 */
export class CacheProviderError extends Schema.TaggedError<CacheProviderError>()(
  "CacheProviderError",
  { operation: Schema.String },
) {
  readonly code = "RELKIT_CACHE_PROVIDER_UNAVAILABLE" as const;
  constructor(operation: CacheOperation) {
    super({ operation });
  }
  override get message(): string {
    return `Cache provider does not implement "${this.operation}"`;
  }
}
/** A tagged schema failure retaining its legacy TypeError classification.
 * @param phase - Key or value boundary.
 * @param issues - Safe validator issues.
 * @example new CacheSchemaValidationError("key", [{ message: "Invalid key" }]);
 */
export class CacheSchemaValidationError extends TypeError {
  readonly _tag = "CacheSchemaValidationError" as const;
  readonly code = "RELKIT_CACHE_SCHEMA_VALIDATION" as const;
  constructor(
    readonly phase: "key" | "value",
    readonly issues: readonly StandardIssue[],
  ) {
    super(`Cache ${phase} validation failed`);
    this.name = "CacheSchemaValidationError";
  }
}
/** A tagged TTL violation retaining its legacy RangeError classification.
 * @param message - Stable policy message.
 * @example new CacheTtlPolicyError("Cache ttlMs must be a positive integer");
 */
export class CacheTtlPolicyError extends RangeError {
  readonly _tag = "CacheTtlPolicyError" as const;
  readonly code = "RELKIT_CACHE_TTL_POLICY" as const;
  readonly reason: string;
  constructor(message: string) {
    super(message);
    this.reason = message;
    this.name = "CacheTtlPolicyError";
  }
}
/** Increment needs a numeric value contract.
 * @example new CacheIncrementUnsupportedError();
 */
export class CacheIncrementUnsupportedError extends Schema.TaggedError<CacheIncrementUnsupportedError>()(
  "CacheIncrementUnsupportedError",
  {},
) {
  readonly code = "RELKIT_CACHE_INCREMENT_UNSUPPORTED" as const;
  constructor() {
    super({});
  }
  override get message(): string {
    return "Cache increment requires a numeric value contract";
  }
}
/** Caller cancellation of an operation.
 * @example new CacheOperationCancelledError();
 */
export class CacheOperationCancelledError extends Schema.TaggedError<CacheOperationCancelledError>()(
  "CacheOperationCancelledError",
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
    return "Cache operation cancelled";
  }
}
/** Deadline expiration of an operation.
 * @example new CacheOperationTimeoutError();
 */
export class CacheOperationTimeoutError extends Schema.TaggedError<CacheOperationTimeoutError>()(
  "CacheOperationTimeoutError",
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
    return "Cache operation timed out";
  }
}
/** Provider rejection with its original cause retained.
 * @param fields - Operation and provider cause.
 * @example new CacheProviderFailureError({ operation: "get", cause: "offline" });
 */
export class CacheProviderFailureError extends Schema.TaggedError<CacheProviderFailureError>()(
  "CacheProviderFailureError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}
/** Invalid non-schema input or provider result.
 * @param fields - Stable message and validation phase.
 * @example new CacheValidationError({ reason: "Cache has must return a boolean" });
 */
export class CacheValidationError extends Schema.TaggedError<CacheValidationError>()(
  "CacheValidationError",
  { reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}
