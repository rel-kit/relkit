import {
  CacheOperationCancelledError,
  CacheOperationTimeoutError,
  createCacheClient,
  type CacheClient,
  type CacheOperationContext,
  type CacheOperationOptions,
  type CacheProvider,
} from "@relkit/cache";
import { canonicalJson } from "@relkit/contracts";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import { clone, createFakeRoot, noFailures, positive, text } from "./fake-utils.js";
import type { TestCacheFake, TestCacheFakeOptions, TestCacheSnapshot } from "./cache-types.js";

export type { TestCacheFake, TestCacheFakeOptions, TestCacheSnapshot } from "./cache-types.js";

/** Creates an in-memory cache provider behind the production Promise client. */
export function createTestCacheFake<
  const KeySchema extends StandardSchemaV1 = StandardSchemaV1,
  const ValueSchema extends StandardSchemaV1 = StandardSchemaV1,
>(
  options: TestCacheFakeOptions<KeySchema, ValueSchema> = {},
): TestCacheFake<InferInput<KeySchema>, InferOutput<ValueSchema>> {
  const cacheId = text(options.cacheId ?? "test-cache", "cacheId");
  const ownerId = text(options.ownerId ?? "test", "ownerId");
  const schemaVersion = options.schemaVersion ?? 1;
  const clock = options.clock ?? Date.now;
  const failures = options.failures ?? noFailures;
  const defaultTtlMs = positive(options.defaultTtlMs, "defaultTtlMs");
  const maxTtlMs = positive(options.maxTtlMs, "maxTtlMs");
  if (defaultTtlMs !== undefined && maxTtlMs !== undefined && defaultTtlMs > maxTtlMs) {
    throw new RangeError("Cache defaultTtlMs must not exceed maxTtlMs");
  }
  const rootOwner = createFakeRoot(options.stateRoot, "cache", cacheId);
  const stateRoot = rootOwner.stateRoot;
  const entries = new Map<string, Entry>();
  const flights = new Map<string, Promise<unknown>>();
  let closed = false;

  const provider = Object.freeze<CacheProvider>({
    capabilities: { increment: true },
    get: async (key, context) => {
      open();
      const entry = readEntry(key, context);
      return entry === undefined ? undefined : clone(entry.value);
    },
    set: (key, value, operationOptions, context) => setValue(key, value, operationOptions, context),
    delete: async (key, context) => {
      open();
      const encoded = keyOf(key);
      assertActive(context);
      entries.delete(encoded);
    },
    has: async (key, context) => {
      open();
      return readEntry(key, context) !== undefined;
    },
    getOrSet: async (key, produce, operationOptions, context) => {
      open();
      const encoded = keyOf(key);
      const existing = readEntry(key, context);
      if (existing !== undefined) return clone(existing.value);
      const running = flights.get(encoded);
      if (running !== undefined) return running.then(clone);
      const flight = (async () => {
        const value = await produce();
        await setValue(key, value, operationOptions, context);
        return clone(value);
      })();
      flights.set(encoded, flight);
      try {
        return await flight;
      } finally {
        if (flights.get(encoded) === flight) flights.delete(encoded);
      }
    },
    increment: async (key, delta = 1, operationOptions, context) => {
      if (typeof delta !== "number" || !Number.isFinite(delta)) {
        throw new TypeError("Invalid increment");
      }
      const current = readEntry(key, context)?.value;
      const value = current === undefined ? 0 : current;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError("Cache increment requires a finite numeric value");
      }
      const result = value + delta;
      if (!Number.isFinite(result)) throw new RangeError("Cache increment overflowed");
      await setValue(key, result, operationOptions, context);
      return result;
    },
  });
  const client = createCacheClient({
    ownerId,
    cacheId,
    source: provider,
    ...(options.keySchema === undefined ? {} : { keySchema: options.keySchema }),
    ...(options.valueSchema === undefined ? {} : { valueSchema: options.valueSchema }),
    ...(defaultTtlMs === undefined ? {} : { defaultTtlMs }),
    ...(maxTtlMs === undefined ? {} : { maxTtlMs }),
  }) as CacheClient<InferInput<KeySchema>, InferOutput<ValueSchema>>;
  const fake = Object.freeze({
    ...client,
    capabilities: provider.capabilities!,
    provider,
    client,
    stateRoot,
    seed: (
      key: InferInput<KeySchema>,
      value: InferOutput<ValueSchema>,
      operationOptions?: CacheOperationOptions,
    ) => client.set(key, value, operationOptions),
    read: (key: InferInput<KeySchema>) => client.get(key),
    inspect: () =>
      Object.freeze({ cacheId, schemaVersion, entries: entries.size, inFlight: flights.size }),
    clear: () => entries.clear(),
    close: async () => {
      if (closed) return;
      closed = true;
      entries.clear();
      flights.clear();
      rootOwner.cleanup(false);
    },
  });
  return fake as TestCacheFake<InferInput<KeySchema>, InferOutput<ValueSchema>>;

  function keyOf(key: unknown): string {
    try {
      return canonicalJson({ cacheId, key, schemaVersion });
    } catch {
      throw new TypeError("Cache key must be canonical JSON data");
    }
  }

  function readEntry(key: unknown, context: CacheOperationContext | undefined): Entry | undefined {
    const encoded = keyOf(key);
    const now = assertActive(context);
    const entry = entries.get(encoded);
    if (entry?.expiresAt !== undefined && entry.expiresAt <= now) {
      entries.delete(encoded);
      return undefined;
    }
    return entry;
  }

  async function setValue(
    key: unknown,
    value: unknown,
    operationOptions: CacheOperationOptions | undefined,
    context: CacheOperationContext | undefined,
  ): Promise<void> {
    open();
    const encoded = keyOf(key);
    const serialized = canonicalJson(value);
    const now = assertActive(context);
    const ttlMs = operationOptions?.ttlMs ?? defaultTtlMs;
    if (ttlMs !== undefined && (ttlMs <= 0 || !Number.isSafeInteger(ttlMs))) {
      throw new RangeError("Cache ttlMs must be a positive integer");
    }
    if (maxTtlMs !== undefined && ttlMs !== undefined && ttlMs > maxTtlMs) {
      throw new RangeError("Cache ttlMs exceeds the configured maximum");
    }
    failures.check("cache.before-set");
    entries.set(encoded, {
      value: structuredClone(JSON.parse(serialized)),
      ...(ttlMs === undefined ? {} : { expiresAt: now + ttlMs }),
    });
  }

  function open(): void {
    if (closed) throw new Error("Test cache is closed");
  }

  function assertActive(context: CacheOperationContext | undefined): number {
    if (context?.signal.aborted) throw new CacheOperationCancelledError();
    const now = clock();
    if (!Number.isFinite(now)) throw new TypeError("Cache clock must return a finite number");
    if (context?.deadlineMs !== undefined && context.deadlineMs <= now) {
      throw new CacheOperationTimeoutError();
    }
    return now;
  }
}

export const createTestCache = createTestCacheFake;

interface Entry {
  readonly value: unknown;
  readonly expiresAt?: number;
}
