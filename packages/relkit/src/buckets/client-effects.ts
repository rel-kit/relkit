import { Effect } from "effect";
import { BucketValidationError } from "./bucket-validation-error.js";
import { validateKeyEffect, validatePrefixEffect } from "./client-key.js";
import { observeBucket } from "./client-observability.js";
import { runBucketOperation } from "./client-operation.js";
import { required } from "./client-utils.js";
import {
  validateBooleanEffect,
  validateBytesEffect,
  validateKeysEffect,
  validateMetadataEffect,
  validateUrlEffect,
} from "./client-results.js";
import type { BucketObjectMetadata, BucketPutOptions } from "./client.types.js";

/** Stores bytes under a portable key.
 * @param key - Object key.
 * @param bytes - Content bytes.
 * @param options - Optional content metadata.
 * @returns Effect of void or a typed bucket error.
 * @example Effect.provide(putBucketEffect("a", new Uint8Array()), layer);
 */
export const putBucketEffect = Effect.fn("bucket.put")(
  (key: string, bytes: Uint8Array, options?: BucketPutOptions) =>
    observeBucket(
      "put",
      Effect.gen(function* () {
        yield* validateKeyEffect(key);
        if (!(bytes instanceof Uint8Array))
          return yield* new BucketValidationError({ message: "Bucket bytes must be a Uint8Array" });
        return yield* runBucketOperation<void>({
          operation: "put",
          input: { key, bytes, options },
          work: (provider, context) => required(provider.put, "put")(key, bytes, options, context),
          validate: () => Effect.void,
        });
      }),
    ),
);

/** Reads bytes for one key.
 * @param key - Object key.
 * @returns Effect of bytes, undefined, or a typed bucket error.
 * @example Effect.provide(getBucketEffect("a"), layer);
 */
export const getBucketEffect = Effect.fn("bucket.get")((key: string) =>
  observeBucket(
    "get",
    Effect.flatMap(validateKeyEffect(key), () =>
      runBucketOperation<Uint8Array | undefined>({
        operation: "get",
        input: { key },
        work: (provider, context) => required(provider.get, "get")(key, context),
        validate: validateBytesEffect,
      }),
    ),
  ),
);

/** Reads metadata for one key.
 * @param key - Object key.
 * @returns Effect of metadata, undefined, or a typed bucket error.
 * @example Effect.provide(headBucketEffect("a"), layer);
 */
export const headBucketEffect = Effect.fn("bucket.head")((key: string) =>
  observeBucket(
    "head",
    Effect.flatMap(validateKeyEffect(key), () =>
      runBucketOperation<BucketObjectMetadata | undefined>({
        operation: "head",
        input: { key },
        work: (provider, context) => required(provider.head, "head")(key, context),
        validate: validateMetadataEffect,
      }),
    ),
  ),
);

/** Deletes one key.
 * @param key - Object key.
 * @returns Effect of void or a typed bucket error.
 * @example Effect.provide(deleteBucketEffect("a"), layer);
 */
export const deleteBucketEffect = Effect.fn("bucket.delete")((key: string) =>
  observeBucket(
    "delete",
    Effect.flatMap(validateKeyEffect(key), () =>
      runBucketOperation<void>({
        operation: "delete",
        input: { key },
        work: (provider, context) => required(provider.delete, "delete")(key, context),
        validate: () => Effect.void,
      }),
    ),
  ),
);

/** Checks whether one key exists.
 * @param key - Object key.
 * @returns Effect of a boolean or a typed bucket error.
 * @example Effect.provide(existsBucketEffect("a"), layer);
 */
export const existsBucketEffect = Effect.fn("bucket.exists")((key: string) =>
  observeBucket(
    "exists",
    Effect.flatMap(validateKeyEffect(key), () =>
      runBucketOperation<boolean>({
        operation: "exists",
        input: { key },
        work: (provider, context) => required(provider.exists, "exists")(key, context),
        validate: validateBooleanEffect,
      }),
    ),
  ),
);

/** Lists keys under an optional prefix.
 * @param prefix - Portable prefix, including empty string.
 * @returns Effect of ordered keys or a typed bucket error.
 * @example Effect.provide(listBucketEffect("images/"), layer);
 */
export const listBucketEffect = Effect.fn("bucket.list")((prefix?: string) =>
  observeBucket(
    "list",
    Effect.flatMap(prefix === undefined ? Effect.void : validatePrefixEffect(prefix), () =>
      runBucketOperation<readonly string[]>({
        operation: "list",
        input: { prefix },
        work: (provider, context) => required(provider.list, "list")(prefix, context),
        validate: validateKeysEffect,
      }),
    ),
  ),
);

/** Creates a signed read URL when supported.
 * @param key - Object key.
 * @returns Effect of a URL or a typed bucket error.
 * @example Effect.provide(createBucketReadUrlEffect("a"), layer);
 */
export const createBucketReadUrlEffect = Effect.fn("bucket.createReadUrl")((key: string) =>
  observeBucket(
    "createReadUrl",
    Effect.flatMap(validateKeyEffect(key), () =>
      runBucketOperation<string>({
        operation: "createReadUrl",
        input: { key },
        capability: "signedReadUrl",
        work: (provider, context) =>
          required(provider.createReadUrl, "createReadUrl")(key, context),
        validate: (value) => validateUrlEffect(value, "createReadUrl"),
      }),
    ),
  ),
);

/** Creates a signed write URL when supported.
 * @param key - Object key.
 * @returns Effect of a URL or a typed bucket error.
 * @example Effect.provide(createBucketWriteUrlEffect("a"), layer);
 */
export const createBucketWriteUrlEffect = Effect.fn("bucket.createWriteUrl")((key: string) =>
  observeBucket(
    "createWriteUrl",
    Effect.flatMap(validateKeyEffect(key), () =>
      runBucketOperation<string>({
        operation: "createWriteUrl",
        input: { key },
        capability: "signedWriteUrl",
        work: (provider, context) =>
          required(provider.createWriteUrl, "createWriteUrl")(key, context),
        validate: (value) => validateUrlEffect(value, "createWriteUrl"),
      }),
    ),
  ),
);
