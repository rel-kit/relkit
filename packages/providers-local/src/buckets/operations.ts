import { decode, hash, assertActive, validateAccess } from "./object-validation.js";
import { Effect } from "effect";
import { localOperation, localPromise, localSync } from "../local-effect.js";
import { type BucketOperationContext, type BucketPutOptions } from "@relkit/buckets";
import { validatePut } from "./policy.js";
import type { LocalBucketStorage } from "./storage.js";
import { type LocalBucketObjectMetadata, type LocalBucketPolicy } from "./types.js";

export { assertActive } from "./object-validation.js";

/**
 * Validates policy and copies bytes before persisting an integrity-protected object.
 * @param storage - Owned object IO operations.
 * @param policy - Validated effective provider policy.
 * @param key - Application key to validate and resolve.
 * @param bytes - Caller-provided object bytes.
 * @param options - Caller policy, pagination or construction settings.
 * @param context - Caller cancellation, deadline and operation metadata.
 * @param open - Admission guard for the provider lifecycle.
 * @returns A lazy operation completing after the object write.
 */
export const putObject = Effect.fn("Bucket.putObject")(
  function* (
    storage: LocalBucketStorage,
    policy: Readonly<LocalBucketPolicy>,
    key: string,
    bytes: Uint8Array,
    options: BucketPutOptions | undefined,
    context: BucketOperationContext | undefined,
    open: () => void,
  ) {
    const normalizedKey = yield* validateAccess(key, context, open);
    if (!(bytes instanceof Uint8Array))
      return yield* localSync(() => {
        throw new TypeError("Bucket bytes must be a Uint8Array");
      });
    const copy = new Uint8Array(bytes);
    const prepared = yield* localSync(() => validatePut(copy, options, policy));
    const contentHash = hash(copy);
    yield* localPromise(() =>
      storage.write({
        version: 1,
        key: normalizedKey,
        size: copy.byteLength,
        contentHash,
        etag: contentHash,
        ...prepared,
        data: Buffer.from(copy).toString("base64"),
      }),
    ).pipe(Effect.uninterruptible);
  },
  (effect, _storage, _policy, _key, bytes) =>
    localOperation("Bucket.putObject", effect, () => ({ bytes: bytes.byteLength })),
);

/**
 * Loads an object and verifies its bytes against the persisted hash.
 * @param storage - Owned object IO operations.
 * @param key - Application key to validate and resolve.
 * @param context - Caller cancellation, deadline and operation metadata.
 * @param open - Admission guard for the provider lifecycle.
 * @returns A lazy operation yielding copied bytes or undefined.
 */
export const getObject = Effect.fn("Bucket.getObject")(
  function* (
    storage: LocalBucketStorage,
    key: string,
    context: BucketOperationContext | undefined,
    open: () => void,
  ) {
    const object = yield* loadObject(storage, key, context, open);
    return object === undefined ? undefined : yield* localSync(() => decode(object));
  },
  (effect) => localOperation("Bucket.getObject", effect),
);

/**
 * Reads verified object metadata without exposing encoded content.
 * @param storage - Owned object IO operations.
 * @param key - Application key to validate and resolve.
 * @param context - Caller cancellation, deadline and operation metadata.
 * @param open - Admission guard for the provider lifecycle.
 * @returns A lazy operation yielding metadata or undefined.
 */
export const headObject = Effect.fn("Bucket.headObject")(
  function* (
    storage: LocalBucketStorage,
    key: string,
    context: BucketOperationContext | undefined,
    open: () => void,
  ) {
    const object = yield* loadObject(storage, key, context, open);
    if (object === undefined) return undefined;
    yield* localSync(() => decode(object));
    return Object.freeze({
      etag: object.etag,
      contentHash: object.contentHash,
      size: object.size,
      ...(object.contentType === undefined ? {} : { contentType: object.contentType }),
      ...(Object.keys(object.metadata).length === 0 ? {} : { metadata: object.metadata }),
    }) as LocalBucketObjectMetadata;
  },
  (effect) => localOperation("Bucket.headObject", effect),
);

/**
 * Validates ownership and removes one object.
 * @param storage - Owned object IO operations.
 * @param key - Application key to validate and resolve.
 * @param context - Caller cancellation, deadline and operation metadata.
 * @param open - Admission guard for the provider lifecycle.
 * @returns A lazy operation completing after deletion.
 */
export const deleteObject = Effect.fn("Bucket.deleteObject")(
  function* (
    storage: LocalBucketStorage,
    key: string,
    context: BucketOperationContext | undefined,
    open: () => void,
  ) {
    const normalizedKey = yield* validateAccess(key, context, open);
    yield* localPromise(() => storage.remove(normalizedKey));
  },
  (effect) => localOperation("Bucket.deleteObject", effect),
);

/**
 * Checks whether a key resolves to an integrity-checked object.
 * @param storage - Owned object IO operations.
 * @param key - Application key to validate and resolve.
 * @param context - Caller cancellation, deadline and operation metadata.
 * @param open - Admission guard for the provider lifecycle.
 * @returns A lazy operation yielding object existence.
 */
export const existsObject = Effect.fn("Bucket.existsObject")(
  function* (
    storage: LocalBucketStorage,
    key: string,
    context: BucketOperationContext | undefined,
    open: () => void,
  ) {
    return (yield* headObject(storage, key, context, open)) !== undefined;
  },
  (effect) => localOperation("Bucket.existsObject", effect),
);

/**
 * Collects valid keys matching a normalized prefix in lexical order.
 * @param storage - Owned object IO operations.
 * @param prefix - Normalized key prefix binding the result or cursor.
 * @returns A lazy operation yielding sorted keys.
 */
export const listKeys = Effect.fn("Bucket.listKeys")(
  function* (storage: LocalBucketStorage, prefix: string) {
    const objects = yield* localPromise(() => storage.list());
    return yield* localSync(() =>
      objects
        .filter((object) => object.key.startsWith(prefix))
        .map((object) => {
          decode(object);
          return object.key;
        })
        .sort((left, right) => left.localeCompare(right)),
    );
  },
  (effect) => localOperation("Bucket.listKeys", effect),
);

/**
 * Checks access and reads an integrity-validated persisted bucket object.
 * @param storage - Owned bucket filesystem operations.
 * @param key - Normalized or caller-provided storage key.
 * @param context - Caller cancellation, deadline and scope metadata.
 * @param open - Lifecycle admission guard.
 * @returns The lazy read yielding the stored envelope or undefined.
 */
const loadObject = Effect.fn("Bucket.loadObject")(function* (
  storage: LocalBucketStorage,
  key: string,
  context: BucketOperationContext | undefined,
  open: () => void,
) {
  const normalizedKey = yield* validateAccess(key, context, open);
  const object = yield* localPromise(() => storage.read(normalizedKey));
  if (object !== undefined) yield* localSync(() => decode(object));
  return object;
});
