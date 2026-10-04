import {
  createCacheClient,
  type CacheClient,
  type CacheOperationOptions,
  type CacheProvider,
} from "@relkit/cache";
import { Effect, Layer, ManagedRuntime } from "effect";
import { runExecutionPromise, runExecutionSync } from "@relkit/contracts/operation";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import { TestCacheStorage, cacheStorageLayer } from "./cache-storage.js";
import type { CacheStorageService } from "./cache-storage.types.js";
import { disposeTestingOwner, testingLoggerLayer } from "./testing-owner.js";
import type { TestCacheFake, TestCacheFakeOptions } from "./cache-types.js";
export type { TestCacheFake, TestCacheFakeOptions, TestCacheSnapshot } from "./cache-types.js";

/**
 * Creates authoritative cache storage behind the production Promise client.
 * @typeParam KeySchema Schema determining accepted native keys.
 * @typeParam ValueSchema Schema determining decoded values.
 * @param options Identity, native schema/TTL policy and injected clock.
 * @returns A synchronously ready isolated fake; close releases its Layer/root.
 * @see tests/fixtures/checked-examples.ts ownedHelpersExample for checked schema inference.
 */
export function createTestCacheFake<
  const KeySchema extends StandardSchemaV1 = StandardSchemaV1,
  const ValueSchema extends StandardSchemaV1 = StandardSchemaV1,
>(
  options: TestCacheFakeOptions<KeySchema, ValueSchema> = {},
): TestCacheFake<InferInput<KeySchema>, InferOutput<ValueSchema>> {
  const provider: CacheProvider = Object.freeze({
    capabilities: { increment: true },
    get: (...args: Parameters<NonNullable<CacheProvider["get"]>>) => run(storage.get(...args)),
    set: (...args: Parameters<NonNullable<CacheProvider["set"]>>) => run(storage.set(...args)),
    delete: (...args: Parameters<NonNullable<CacheProvider["delete"]>>) =>
      run(storage.delete(...args)),
    has: (...args: Parameters<NonNullable<CacheProvider["has"]>>) => run(storage.has(...args)),
    increment: (...args: Parameters<NonNullable<CacheProvider["increment"]>>) =>
      run(storage.increment(...args)),
    getOrSet: (...args: Parameters<NonNullable<CacheProvider["getOrSet"]>>) =>
      run(storage.getOrSet(...args)),
  });
  const client = createCacheClient({
    ownerId: options.ownerId?.trim() ?? "test",
    cacheId: options.cacheId?.trim() ?? "test-cache",
    source: provider,
    ...(options.keySchema === undefined ? {} : { keySchema: options.keySchema }),
    ...(options.valueSchema === undefined ? {} : { valueSchema: options.valueSchema }),
    ...(options.defaultTtlMs === undefined ? {} : { defaultTtlMs: options.defaultTtlMs }),
    ...(options.maxTtlMs === undefined ? {} : { maxTtlMs: options.maxTtlMs }),
  }) as CacheClient<InferInput<KeySchema>, InferOutput<ValueSchema>>;
  const owner = ManagedRuntime.make(
    cacheStorageLayer(options).pipe(Layer.provideMerge(testingLoggerLayer(options.logger))),
  );
  let storage: CacheStorageService;
  try {
    storage = runExecutionSync(owner, TestCacheStorage);
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
      : Promise.reject(new Error("Test cache is closed"));
  }
  return Object.freeze({
    ...client,
    capabilities: provider.capabilities!,
    provider,
    client,
    stateRoot: storage.stateRoot,
    seed: (
      key: InferInput<KeySchema>,
      value: InferOutput<ValueSchema>,
      write?: CacheOperationOptions,
    ) => client.set(key, value, write),
    read: (key: InferInput<KeySchema>) => client.get(key),
    inspect: () => Effect.runSync(Effect.provide(storage.inspect, context)),
    snapshot: () => Effect.runSync(Effect.provide(storage.snapshot, context)),
    restore: (snapshot: unknown) => runExecutionSync(owner, storage.restore(snapshot)),
    clear: () => Effect.runSync(Effect.provide(storage.clear, context)),
    close: () =>
      (closing ??= runExecutionPromise(owner, storage.close).finally(() =>
        disposeTestingOwner(owner),
      )),
  }) as TestCacheFake<InferInput<KeySchema>, InferOutput<ValueSchema>>;
}

/** @inheritDoc createTestCacheFake */
export const createTestCache = createTestCacheFake;
