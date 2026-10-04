import { canonicalJson } from "@relkit/contracts";
import { Context, Effect, Layer, Ref, Schema } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { clone, createFakeRoot, noFailures, positive, text } from "./fake-utils.js";
import type { TestCacheFakeOptions } from "./cache-types.js";
import { cacheStorageOperations } from "./cache-storage-state.js";
import type { CacheStorageState, CacheEntry, CacheStorageService } from "./cache-storage.types.js";
import { CacheStorageKey, CacheStorageSnapshot } from "./cache-storage.schemas.js";
import type { CacheStorageSnapshot as SnapshotValue } from "./cache-storage.types.js";

/** Authoritative writable cache state, never subject to memoization eviction. */
export class TestCacheStorage extends Context.Service<TestCacheStorage, CacheStorageService>()(
  "relkit/testing/CacheStorage",
) {}

/**
 * Acquires one isolated fake root with scoped release and native cache semantics.
 * @param options Validated identity, schemas, clock and failure injection policy.
 * @returns A service Layer whose close clears storage and releases its root.
 */
export function cacheStorageLayer(options: TestCacheFakeOptions) {
  return Layer.effect(
    TestCacheStorage,
    Effect.acquireRelease(
      Effect.clockWith((liveClock) =>
        Effect.sync(() => {
          const cacheId = text(options.cacheId ?? "test-cache", "cacheId");
          text(options.ownerId ?? "test", "ownerId");
          const schemaVersion = options.schemaVersion ?? 1;
          if (
            typeof schemaVersion !== "string" &&
            (typeof schemaVersion !== "number" || !Number.isFinite(schemaVersion))
          )
            throw new TypeError("Invalid cache schemaVersion");
          const clock = options.clock ?? liveClock.currentTimeMillisUnsafe;
          const failures = options.failures ?? noFailures;
          const defaultTtlMs = positive(options.defaultTtlMs, "defaultTtlMs");
          const maxTtlMs = positive(options.maxTtlMs, "maxTtlMs");
          if (defaultTtlMs !== undefined && maxTtlMs !== undefined && defaultTtlMs > maxTtlMs)
            throw new RangeError("Cache defaultTtlMs must not exceed maxTtlMs");
          const root = createFakeRoot(options.stateRoot, "cache", cacheId);
          const state = Ref.makeUnsafe<CacheStorageState>({
            closed: false,
            entries: new Map<string, CacheEntry>(),
            flights: new Map<string, Promise<unknown>>(),
          });
          const { open, keyOf, readEntry, writeEntry, active } = cacheStorageOperations(state, {
            cacheId,
            schemaVersion,
            clock,
            failures,
            defaultTtlMs,
            maxTtlMs,
          });
          /**
           * Runs one atomic native decision in the owner's observation context.
           * @param name Fixed operation label.
           * @param work Atomic storage decision.
           * @returns Observed effect preserving native failures.
           * @typeParam A - Native operation result retained by the adapter.
           */
          function operation<A>(name: string, work: () => A) {
            return observeExecution(
              "testing",
              name,
              Effect.fn(name)(() =>
                Effect.try({
                  try: () => {
                    open();
                    return work();
                  },
                  catch: (cause) => cause,
                }),
              )(),
            );
          }
          const service = TestCacheStorage.of({
            stateRoot: root.stateRoot,
            get: (key, context) =>
              operation("cache.get", () => {
                const entry = readEntry(key, context);
                return entry === undefined ? undefined : clone(entry.value);
              }),
            set: (key, value, write, context) =>
              operation("cache.set", () => writeEntry(key, value, write, context)),
            delete: (key, context) =>
              operation("cache.delete", () => {
                const encoded = keyOf(key);
                active(context);
                open().entries.delete(encoded);
              }),
            has: (key, context) =>
              operation("cache.has", () => readEntry(key, context) !== undefined),
            increment: (key, delta = 1, write, context) =>
              operation("cache.increment", () => {
                if (typeof delta !== "number" || !Number.isFinite(delta))
                  throw new TypeError("Invalid increment");
                const current = readEntry(key, context)?.value;
                const value = current === undefined ? 0 : current;
                if (typeof value !== "number" || !Number.isFinite(value))
                  throw new TypeError("Cache increment requires a finite numeric value");
                const result = value + delta;
                if (!Number.isFinite(result)) throw new RangeError("Cache increment overflowed");
                writeEntry(key, result, write, context);
                return result;
              }),
            getOrSet: (key, produce, write, context) =>
              observeExecution(
                "testing",
                "cache.getOrSet",
                Effect.fn("Testing.cache.getOrSet")(() =>
                  Effect.tryPromise({
                    try: async () => {
                      const current = open();
                      const encoded = keyOf(key);
                      const existing = readEntry(key, context);
                      if (existing !== undefined) return clone(existing.value);
                      const running = current.flights.get(encoded);
                      if (running !== undefined) return running.then(clone);
                      const flight = (async () => {
                        const value = await produce();
                        writeEntry(key, value, write, context);
                        return clone(value);
                      })();
                      current.flights.set(encoded, flight);
                      try {
                        return clone(await flight);
                      } finally {
                        if (current.flights.get(encoded) === flight)
                          current.flights.delete(encoded);
                      }
                    },
                    catch: (cause) => cause,
                  }),
                )(),
              ),
            inspect: Effect.sync(() => {
              const current = Ref.getUnsafe(state);
              return Object.freeze({
                cacheId,
                schemaVersion,
                entries: current.entries.size,
                inFlight: current.flights.size,
              });
            }),
            snapshot: Effect.sync(() =>
              Object.freeze({
                cacheId,
                schemaVersion,
                records: [...Ref.getUnsafe(state).entries].map(([key, entry]) => ({
                  key,
                  ...(clone(entry) as CacheEntry),
                })),
              }),
            ),
            restore: (input) =>
              operation("cache.restore", () => {
                let snapshot: SnapshotValue;
                try {
                  snapshot = Schema.decodeUnknownSync(CacheStorageSnapshot)(input);
                } catch {
                  throw new TypeError("Invalid cache snapshot");
                }
                if (snapshot.cacheId !== cacheId || snapshot.schemaVersion !== schemaVersion)
                  throw new TypeError("Cache snapshot identity mismatch");
                const next = new Map<string, CacheEntry>();
                for (const entry of snapshot.records) {
                  let identity: typeof CacheStorageKey.Type;
                  try {
                    identity = Schema.decodeUnknownSync(CacheStorageKey)(JSON.parse(entry.key));
                  } catch {
                    throw new TypeError("Invalid cache snapshot key");
                  }
                  if (identity.cacheId !== cacheId || identity.schemaVersion !== schemaVersion)
                    throw new TypeError("Cache snapshot key mismatch");
                  if (canonicalJson(identity) !== entry.key)
                    throw new TypeError("Cache snapshot key must be canonical JSON");
                  next.set(entry.key, {
                    value: JSON.parse(canonicalJson(entry.value)),
                    ...(entry.expiresAt === undefined ? {} : { expiresAt: entry.expiresAt }),
                  });
                }
                const entries = open().entries;
                entries.clear();
                for (const [key, entry] of next) entries.set(key, entry);
              }),
            clear: observeExecution(
              "testing",
              "cache.clear",
              Effect.sync(() => Ref.getUnsafe(state).entries.clear()),
            ),
            close: Effect.uninterruptible(
              Effect.suspend(() => {
                const current = Ref.getUnsafe(state);
                if (current.closed) return Effect.void;
                current.closed = true;
                return observeExecution(
                  "testing",
                  "cache.close",
                  Effect.sync(() => {
                    current.entries.clear();
                    current.flights.clear();
                    root.cleanup(false);
                  }),
                );
              }),
            ),
          });
          return service;
        }),
      ),
      (service) => service.close,
    ),
  );
}
