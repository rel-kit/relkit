import { Effect, Layer, ManagedRuntime } from "effect";
import { runExecutionPromise, runExecutionSync } from "@relkit/contracts/operation";
import { createBucketClient, type BucketProvider, type BucketPutOptions } from "@relkit/buckets";
import { TestBucketStorage, bucketStorageLayer } from "./bucket-storage.js";
import type { BucketStorageService } from "./bucket-storage.types.js";
import { disposeTestingOwner, testingLoggerLayer } from "./testing-owner.js";
import type { TestBucketFake, TestBucketFakeOptions } from "./buckets-types.js";
export type { TestBucketFake, TestBucketFakeOptions, TestBucketObject } from "./buckets-types.js";

/**
 * Creates an authoritative in-memory provider behind the production Promise client.
 * @param options Bucket identity, native policy and deterministic test dependencies.
 * @returns A synchronously ready fake; await close to release its owned root and Layer.
 * @see tests/fixtures/checked-examples.ts ownedHelpersExample for checked resource ownership.
 */
export function createTestBucketFake(options: TestBucketFakeOptions = {}): TestBucketFake {
  const provider: BucketProvider = Object.freeze({
    capabilities: { signedReadUrl: false, signedWriteUrl: false },
    put: (...args: Parameters<NonNullable<BucketProvider["put"]>>) => run(storage.put(...args)),
    get: (...args: Parameters<NonNullable<BucketProvider["get"]>>) => run(storage.get(...args)),
    head: (...args: Parameters<NonNullable<BucketProvider["head"]>>) => run(storage.head(...args)),
    delete: (...args: Parameters<NonNullable<BucketProvider["delete"]>>) =>
      run(storage.delete(...args)),
    exists: (...args: Parameters<NonNullable<BucketProvider["exists"]>>) =>
      run(storage.exists(...args)),
    list: (...args: Parameters<NonNullable<BucketProvider["list"]>>) => run(storage.list(...args)),
  });
  const client = createBucketClient({
    ownerId: options.ownerId?.trim() ?? "test",
    bucketId: options.bucketId?.trim() ?? "test-bucket",
    source: provider,
  });
  const owner = ManagedRuntime.make(
    bucketStorageLayer(options).pipe(Layer.provideMerge(testingLoggerLayer(options.logger))),
  );
  let storage: BucketStorageService;
  try {
    storage = runExecutionSync(owner, TestBucketStorage);
  } catch (error) {
    void disposeTestingOwner(owner).catch(() => undefined);
    throw error;
  }
  let closing: Promise<void> | undefined;
  const context = runExecutionSync(owner, Effect.context<never>());
  /**
   * Rejects new native provider work once this owner starts closing.
   * @typeParam A Native operation result.
   * @param effect Storage workflow using the acquired service.
   * @returns The observed result or the established closed-owner error.
   */
  function run<A>(effect: Effect.Effect<A, unknown>): Promise<A> {
    return closing === undefined
      ? runExecutionPromise(owner, effect)
      : Promise.reject(new Error("Test bucket is closed"));
  }
  return Object.freeze({
    ...client,
    capabilities: provider.capabilities!,
    provider,
    client,
    stateRoot: storage.stateRoot,
    seed: (key: string, bytes: Uint8Array, putOptions?: BucketPutOptions) =>
      client.put(key, bytes, putOptions),
    read: (key: string) => client.get(key),
    inspect: () => Effect.runSync(Effect.provide(storage.inspect, context)),
    snapshot: () => Effect.runSync(Effect.provide(storage.snapshot, context)),
    restore: (snapshot: unknown) => runExecutionSync(owner, storage.restore(snapshot)),
    clear: () => Effect.runSync(Effect.provide(storage.clear, context)),
    close: () =>
      (closing ??= runExecutionPromise(owner, storage.close).finally(() =>
        disposeTestingOwner(owner),
      )),
  }) as TestBucketFake;
}

/** @inheritDoc createTestBucketFake */
export const createTestBucket = createTestBucketFake;
