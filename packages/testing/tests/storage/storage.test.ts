import { expect, it } from "@effect/vitest";
import { Context, Deferred, Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { TestBucketStorage, bucketStorageLayer } from "../../src/bucket-storage.js";
import { TestCacheStorage, cacheStorageLayer } from "../../src/cache-storage.js";
import { createTestBucketFake } from "../../src/buckets.js";
import { createTestCacheFake } from "../../src/cache.js";
import { createFailures } from "../../src/jobs-utils.js";
import { createDeterministicClock } from "../../src/runtime-clock.js";
import { createExecutionEvidence } from "../fixtures/execution-evidence.ts";

it.effect("observes storage clear and records each actual release once", () =>
  Effect.gen(function* () {
    const evidence = createExecutionEvidence();
    yield* Effect.gen(function* () {
      const bucket = yield* TestBucketStorage;
      const cache = yield* TestCacheStorage;
      yield* bucket.put("key", new Uint8Array([1]));
      yield* cache.set("key", 1);
      yield* bucket.clear;
      yield* cache.clear;
      expect(yield* bucket.inspect).toHaveLength(0);
      expect((yield* cache.inspect).entries).toBe(0);
      yield* bucket.close;
      yield* bucket.close;
      yield* cache.close;
      yield* cache.close;
    }).pipe(
      Effect.provide(Layer.mergeAll(bucketStorageLayer(), cacheStorageLayer({}))),
      Effect.provide(evidence.layer),
    );
    for (const operation of ["bucket.clear", "cache.clear", "bucket.close", "cache.close"]) {
      const counter = [...evidence.registry.values()].find(
        (entry) =>
          entry.id === "relkit_execution_operations_total" &&
          entry.attributes?.operation === operation,
      );
      expect(counter?.hooks.get(Context.empty()).count).toBe(1);
    }
  }),
);

it.effect("captures the provisioned Effect test clock for native TTL decisions", () =>
  Effect.gen(function* () {
    const cache = yield* TestCacheStorage;
    yield* cache.set("key", "value", { ttlMs: 10 });
    expect(yield* cache.get("key")).toBe("value");
    yield* TestClock.adjust(10);
    expect(yield* cache.get("key")).toBeUndefined();
  }).pipe(Effect.provide(cacheStorageLayer({}))),
);

it.effect("detaches bucket bytes, preserves committed failure writes and restores atomically", () =>
  Effect.gen(function* () {
    const failures = createFailures();
    const bucket = createTestBucketFake({ failures });
    try {
      const bytes = new Uint8Array([1, 2]);
      yield* Effect.promise(() => bucket.put("first", bytes));
      bytes[0] = 9;
      const read = yield* Effect.promise(() => bucket.get("first"));
      expect([...read!]).toEqual([1, 2]);
      read![0] = 8;
      expect([...(yield* Effect.promise(() => bucket.get("first")))!]).toEqual([1, 2]);
      const sentinel = new Error("committed");
      failures.once!("bucket.after-write-before-ack", sentinel);
      yield* Effect.promise(() =>
        expect(bucket.put("second", new Uint8Array([3]))).rejects.toBe(sentinel),
      );
      expect(yield* Effect.promise(() => bucket.exists("second"))).toBe(true);
      const snapshot = bucket.snapshot();
      bucket.clear();
      bucket.restore(snapshot);
      snapshot.records[0]!.bytes[0] = 7;
      expect([...(yield* Effect.promise(() => bucket.get("first")))!]).toEqual([1, 2]);
      expect(() => bucket.restore({ ...snapshot, bucketId: "another" })).toThrow(
        "identity mismatch",
      );
      expect(yield* Effect.promise(() => bucket.exists("second"))).toBe(true);
    } finally {
      yield* Effect.promise(() => bucket.close());
    }
  }),
);

it.effect("single-flights cache production while returning independent mutable values", () =>
  Effect.gen(function* () {
    const cache = createTestCacheFake();
    const available = yield* Deferred.make<{ value: number }>();
    let productions = 0;
    try {
      const produce = () => {
        productions++;
        return Effect.runPromise(Deferred.await(available));
      };
      const first = cache.getOrSet("same", produce);
      const second = cache.getOrSet("same", produce);
      yield* Effect.yieldNow;
      yield* Deferred.succeed(available, { value: 1 });
      const [one, two] = yield* Effect.promise(() => Promise.all([first, second]));
      expect(productions).toBe(1);
      expect(one).toEqual({ value: 1 });
      expect(two).not.toBe(one);
      (one as { value: number }).value = 9;
      expect(two).toEqual({ value: 1 });
      expect(yield* Effect.promise(() => cache.get("same"))).toEqual({ value: 1 });
    } finally {
      yield* Effect.promise(() => cache.close());
    }
  }),
);

it.effect("restores cache TTL/version and retains writes after ambiguous acknowledgement", () =>
  Effect.gen(function* () {
    const clock = createDeterministicClock(1_000).clock;
    const failures = createFailures();
    const cache = createTestCacheFake({ clock: clock.currentTimeMs, failures });
    try {
      const sentinel = new Error("ack");
      failures.once!("cache.after-set-before-ack", sentinel);
      yield* Effect.promise(() =>
        expect(cache.set("counter", 4, { ttlMs: 20 })).rejects.toBe(sentinel),
      );
      expect(yield* Effect.promise(() => cache.increment("counter", 2, { ttlMs: 10 }))).toBe(6);
      const snapshot = cache.snapshot();
      cache.clear();
      cache.restore(snapshot);
      yield* Effect.promise(() => clock.advance(9));
      expect(yield* Effect.promise(() => cache.get("counter"))).toBe(6);
      yield* Effect.promise(() => clock.advance(1));
      expect(yield* Effect.promise(() => cache.get("counter"))).toBeUndefined();
      expect(() => cache.restore({ ...snapshot, schemaVersion: "different" })).toThrow(
        "identity mismatch",
      );
      expect(() => cache.restore({ records: [] })).toThrow("Invalid cache snapshot");
    } finally {
      yield* Effect.promise(() => cache.close());
    }
  }),
);

it.effect("emits configured structured standalone logs without storing operation input", () =>
  Effect.gen(function* () {
    const records: import("@relkit/runtime-effect").RedactedLogRecord[] = [];
    const cache = createTestCacheFake({
      logger: {
        component: "testing",
        human: false,
        json: { write: (record) => records.push(record) },
        minimumLevel: "info",
      },
    });
    try {
      yield* Effect.promise(() => cache.set("private-key", { password: "private-value" }));
      expect(records.length).toBeGreaterThan(0);
      expect(JSON.stringify(records)).not.toContain("private-value");
      expect(JSON.stringify(records)).not.toContain("private-key");
      expect(JSON.stringify(records)).toContain("cache.set");
    } finally {
      yield* Effect.promise(() => cache.close());
    }
  }),
);
