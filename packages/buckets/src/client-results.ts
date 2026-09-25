import { Effect } from "effect";
import { BucketProviderFailureError } from "./client-errors.js";
import type { BucketObjectMetadata, BucketOperation } from "./client.types.js";

function invalid(operation: BucketOperation, message: string): BucketProviderFailureError {
  return new BucketProviderFailureError({ operation, cause: new TypeError(message) });
}

/** Check bytes returned by a provider.
 * @param value - Provider result.
 * @returns Effect of bytes or undefined, or a tagged provider failure.
 * @example Effect.runSync(validateBytesEffect(new Uint8Array()));
 */
export const validateBytesEffect = Effect.fn("bucket.validateBytes")(function* (
  value: Uint8Array | undefined,
) {
  if (value !== undefined && !(value instanceof Uint8Array))
    return yield* Effect.fail(invalid("get", "Bucket get must return bytes or undefined"));
  return value;
});

/** Check metadata returned by a provider.
 * @param value - Provider result.
 * @returns Effect of metadata or undefined, or a tagged provider failure.
 * @example Effect.runSync(validateMetadataEffect({ etag: "abc" }));
 */
export const validateMetadataEffect = Effect.fn("bucket.validateMetadata")(function* (
  value: BucketObjectMetadata | undefined,
) {
  if (value !== undefined && (value === null || typeof value !== "object"))
    return yield* Effect.fail(invalid("head", "Bucket head must return metadata or undefined"));
  return value;
});

/** Check an existence result.
 * @param value - Provider result.
 * @returns Effect of a boolean or a tagged provider failure.
 * @example Effect.runSync(validateBooleanEffect(true));
 */
export const validateBooleanEffect = Effect.fn("bucket.validateBoolean")(function* (
  value: boolean,
) {
  if (typeof value !== "boolean")
    return yield* Effect.fail(invalid("exists", "Bucket exists must return a boolean"));
  return value;
});

/** Check listed keys while retaining provider order.
 * @param value - Provider result.
 * @returns Effect of keys or a tagged provider failure.
 * @example Effect.runSync(validateKeysEffect(["a", "b"]));
 */
export const validateKeysEffect = Effect.fn("bucket.validateKeys")(function* (
  value: readonly string[],
) {
  if (!Array.isArray(value) || !value.every((key) => typeof key === "string"))
    return yield* Effect.fail(invalid("list", "Bucket list must return string keys"));
  return value;
});

/** Check a signed URL result.
 * @param value - Provider result.
 * @param operation - Signed URL method being validated.
 * @returns Effect of URL text or a tagged provider failure.
 * @example Effect.runSync(validateUrlEffect("https://example.test/a", "createReadUrl"));
 */
export const validateUrlEffect = Effect.fn("bucket.validateUrl")(function* (
  value: string,
  operation: "createReadUrl" | "createWriteUrl",
) {
  if (typeof value !== "string")
    return yield* Effect.fail(invalid(operation, "Bucket URL must be a string"));
  return value;
});
