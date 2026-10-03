import { Clock, Effect } from "effect";
import { localSync } from "../local-effect.js";
import { createHash } from "node:crypto";
import {
  BucketOperationCancelledError,
  BucketOperationTimeoutError,
  type BucketOperationContext,
} from "@relkit/buckets";
import { normalizeBucketKey } from "./keys.js";
import { LocalBucketStateError, type StoredLocalBucketObject } from "./types.js";

/**
 * Rejects an aborted or expired operation before cache or bucket IO.
 * @param context - Caller cancellation, deadline and operation metadata.
 * @returns The checked clock time when used by the cache, otherwise nothing.
 * @param now - Current clock time in milliseconds.
 */
export function assertActive(context?: BucketOperationContext, now = Date.now()): void {
  if (context?.signal.aborted) throw new BucketOperationCancelledError();
  if (context?.deadlineMs !== undefined && context.deadlineMs <= now) {
    throw new BucketOperationTimeoutError();
  }
}

/** Checks lifecycle, key and deadline before entering native object IO.
 * @param key - Normalized or caller-provided storage key.
 * @param context - Caller cancellation, deadline and scope metadata.
 * @param open - Lifecycle admission guard.
 * @returns The normalized key after validation.
 */
export const validateAccess = Effect.fn("Bucket.validateAccess")(function* (
  key: string,
  context: BucketOperationContext | undefined,
  open: () => void,
) {
  const now = yield* Clock.currentTimeMillis;
  return yield* localSync(() => {
    open();
    assertActive(context, now);
    return normalizeBucketKey(key);
  });
});

/**
 * Decodes stored bytes and rejects size, hash or etag mismatches.
 * @param object - Validated persisted object envelope.
 * @returns A copied byte array with verified integrity.
 */
export function decode(object: StoredLocalBucketObject): Uint8Array {
  const bytes = new Uint8Array(Buffer.from(object.data, "base64"));
  if (
    bytes.byteLength !== object.size ||
    hash(bytes) !== object.contentHash ||
    object.etag !== object.contentHash
  ) {
    throw new LocalBucketStateError("Bucket object integrity check failed");
  }
  return bytes;
}

/**
 * Computes the SHA-256 content identity used by local object envelopes.
 * @param bytes - Caller-provided object bytes.
 * @returns The prefixed hexadecimal content digest.
 */
export function hash(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
