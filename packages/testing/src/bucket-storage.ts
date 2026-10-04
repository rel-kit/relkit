import { Context, Effect, Layer, Ref, Schema } from "effect";
import { BucketStorageSnapshot } from "./bucket-storage.schemas.js";
import { InvalidTestSnapshot } from "./storage-failure.js";
import { observeExecution } from "@relkit/contracts/operation";
import {
  BucketOperationCancelledError,
  BucketOperationTimeoutError,
  type BucketOperationContext,
} from "@relkit/buckets";
import { createHash } from "node:crypto";
import { createFakeRoot, noFailures, text } from "./fake-utils.js";
import type { TestBucketFakeOptions, TestBucketObject } from "./buckets-types.js";
import type { BucketStorageService } from "./bucket-storage.types.js";
import {
  assertBucketKey,
  assertBucketPrefix,
  copyBucketObject,
  copyBucketMetadata,
} from "./bucket-validation.js";

/** Authoritative writable bucket state; every public read returns detached bytes/metadata. */
export class TestBucketStorage extends Context.Service<TestBucketStorage, BucketStorageService>()(
  "relkit/testing/BucketStorage",
) {}

/**
 * Owns one isolated bucket, validating options before allocating its temporary root.
 * @param options Bucket identity, clock, write policy and failure injection.
 * @returns A synchronously acquired Layer with exactly-once resource release.
 */
export function bucketStorageLayer(options: TestBucketFakeOptions = {}) {
  return Layer.effect(
    TestBucketStorage,
    Effect.acquireRelease(
      Effect.clockWith((liveClock) =>
        Effect.sync(() => {
          const bucketId = text(options.bucketId ?? "test-bucket", "bucketId");
          text(options.ownerId ?? "test", "ownerId");
          const maxObjectBytes = options.maxObjectBytes;
          if (
            maxObjectBytes !== undefined &&
            (!Number.isSafeInteger(maxObjectBytes) || maxObjectBytes <= 0)
          )
            throw new TypeError("maxObjectBytes must be a positive safe integer");
          const allowedContentTypes = options.allowedContentTypes?.map((value) =>
            text(value, "contentType"),
          );
          const failures = options.failures ?? noFailures;
          const clock = options.clock ?? liveClock.currentTimeMillisUnsafe;
          const root = createFakeRoot(options.stateRoot, "buckets", bucketId);
          const state = Ref.makeUnsafe({
            closed: false,
            entries: new Map<string, TestBucketObject>(),
          });

          /**
           * Runs one synchronous storage decision under the owner's observation context.
           * @typeParam A Operation result.
           * @param name Declaration-owned operation label.
           * @param work Atomic validation/read/write function.
           * @returns The domain Effect preserving the original rejection value.
           */
          const operation = <A>(name: string, work: () => A) =>
            observeExecution(
              "testing",
              name,
              Effect.fn("Testing.bucket.operation")(() =>
                Effect.try({
                  try: () => {
                    if (Ref.getUnsafe(state).closed) throw new Error("Test bucket is closed");
                    return work();
                  },
                  catch: (cause) => cause,
                }),
              )(),
            );

          /**
           * Enforces native cancellation/deadlines using the injected domain clock.
           * @param context Optional operation cancellation and deadline.
           * @returns Nothing when storage admission is allowed.
           */
          function active(context: BucketOperationContext | undefined): void {
            if (context?.signal.aborted) throw new BucketOperationCancelledError();
            if (context?.deadlineMs !== undefined && context.deadlineMs <= clock())
              throw new BucketOperationTimeoutError();
          }

          return TestBucketStorage.of({
            stateRoot: root.stateRoot,
            put: (key, bytes, putOptions, context) =>
              operation("bucket.put", () => {
                assertBucketKey(key);
                active(context);
                if (!(bytes instanceof Uint8Array))
                  throw new TypeError("Bucket bytes must be a Uint8Array");
                if (maxObjectBytes !== undefined && bytes.byteLength > maxObjectBytes)
                  throw new RangeError("Bucket object exceeds maxObjectBytes");
                const contentType = putOptions?.contentType;
                if (
                  allowedContentTypes !== undefined &&
                  !allowedContentTypes.includes(contentType ?? "")
                )
                  throw new TypeError("Bucket content type is not allowed");
                const copy = new Uint8Array(bytes);
                const etag = `sha256:${createHash("sha256").update(copy).digest("hex")}`;
                const metadata = Object.freeze({
                  etag,
                  contentHash: etag,
                  size: copy.byteLength,
                  ...(contentType === undefined ? {} : { contentType }),
                  ...(putOptions?.metadata === undefined
                    ? {}
                    : { metadata: { ...putOptions.metadata } }),
                });
                failures.check("bucket.before-write");
                Ref.getUnsafe(state).entries.set(key, { key, bytes: copy, metadata });
                failures.check("bucket.after-write-before-ack");
              }),
            get: (key, context) =>
              operation("bucket.get", () => {
                assertBucketKey(key);
                active(context);
                const entry = Ref.getUnsafe(state).entries.get(key);
                return entry === undefined ? undefined : new Uint8Array(entry.bytes);
              }),
            head: (key, context) =>
              operation("bucket.head", () => {
                assertBucketKey(key);
                active(context);
                return copyBucketMetadata(Ref.getUnsafe(state).entries.get(key)?.metadata);
              }),
            delete: (key, context) =>
              operation("bucket.delete", () => {
                assertBucketKey(key);
                active(context);
                Ref.getUnsafe(state).entries.delete(key);
              }),
            exists: (key, context) =>
              operation("bucket.exists", () => {
                assertBucketKey(key);
                active(context);
                return Ref.getUnsafe(state).entries.has(key);
              }),
            list: (prefix, context) =>
              operation("bucket.list", () => {
                const normalized = prefix === undefined ? "" : assertBucketPrefix(prefix);
                active(context);
                return Object.freeze(
                  [...Ref.getUnsafe(state).entries.keys()]
                    .filter((key) => key.startsWith(normalized))
                    .sort(),
                );
              }),
            inspect: Effect.sync(() =>
              Object.freeze(
                [...Ref.getUnsafe(state).entries.values()]
                  .sort((left, right) => left.key.localeCompare(right.key))
                  .map(copyBucketObject),
              ),
            ),
            snapshot: Effect.sync(() =>
              Object.freeze({
                bucketId,
                records: [...Ref.getUnsafe(state).entries.values()]
                  .sort((left, right) => left.key.localeCompare(right.key))
                  .map(copyBucketObject),
              }),
            ),
            restore: (input) =>
              operation("bucket.restore", () => {
                try {
                  const snapshot = Schema.decodeUnknownSync(BucketStorageSnapshot)(input);
                  if (snapshot.bucketId !== bucketId)
                    throw new InvalidTestSnapshot({ message: "Bucket snapshot identity mismatch" });
                  const next = new Map<string, TestBucketObject>();
                  for (const entry of snapshot.records) {
                    assertBucketKey(entry.key);
                    if (
                      entry.metadata.size !== undefined &&
                      entry.metadata.size !== entry.bytes.byteLength
                    )
                      throw new InvalidTestSnapshot({
                        message: "Bucket snapshot byte size mismatch",
                      });
                    next.set(entry.key, copyBucketObject(entry));
                  }
                  const entries = Ref.getUnsafe(state).entries;
                  entries.clear();
                  for (const [key, entry] of next) entries.set(key, entry);
                } catch (error) {
                  throw new InvalidTestSnapshot({
                    message:
                      error instanceof InvalidTestSnapshot
                        ? error.message
                        : "Invalid bucket snapshot",
                  });
                }
              }).pipe(
                Effect.catch((error) =>
                  Effect.fail(
                    error instanceof InvalidTestSnapshot ? new TypeError(error.message) : error,
                  ),
                ),
              ),
            clear: observeExecution(
              "testing",
              "bucket.clear",
              Effect.sync(() => Ref.getUnsafe(state).entries.clear()),
            ),
            close: Effect.uninterruptible(
              Effect.suspend(() => {
                const value = Ref.getUnsafe(state);
                if (value.closed) return Effect.void;
                value.closed = true;
                return observeExecution(
                  "testing",
                  "bucket.close",
                  Effect.sync(() => {
                    value.entries.clear();
                    root.cleanup(false);
                  }),
                );
              }),
            ),
          });
        }),
      ),
      (storage) => storage.close,
    ),
  );
}
