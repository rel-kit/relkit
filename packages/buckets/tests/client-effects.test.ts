import { describe, expect, test } from "vitest";
import { Effect, Layer, Metric } from "effect";
import {
  BucketCapabilityError,
  BucketDependencyError,
  BucketOperationCancelledError,
  BucketProviderError,
  BucketProviderFailureError,
} from "../src/client-errors.js";
import { BucketValidationError } from "../src/bucket-validation-error.js";
import {
  createBucketReadUrlEffect,
  createBucketWriteUrlEffect,
  deleteBucketEffect,
  existsBucketEffect,
  getBucketEffect,
  headBucketEffect,
  listBucketEffect,
  putBucketEffect,
} from "../src/client-effects.js";
import { BucketRuntime } from "../src/client-runtime.js";
import { BucketTelemetry, observeBucket } from "../src/client-observability.js";
import type { BucketClientOptions, BucketProvider } from "../src/client.types.js";

const layer = (provider: BucketProvider, patch: Partial<BucketClientOptions> = {}) =>
  Layer.succeed(
    BucketRuntime,
    BucketRuntime.of({
      provider,
      options: { ownerId: "job", bucketId: "assets", source: provider, ...patch },
    }),
  );

describe("bucket Effect operations", () => {
  test("runs every operation with a substitutable provider Layer", async () => {
    const calls: string[] = [];
    const provider: BucketProvider = {
      capabilities: ["signedReadUrl", "signedWriteUrl"],
      put: (key, bytes) => {
        calls.push(`put:${key}:${bytes.length}`);
      },
      get: (key) => {
        calls.push(`get:${key}`);
        return new Uint8Array([2]);
      },
      head: () => ({ etag: "abc", size: 1 }),
      delete: () => {
        calls.push("delete");
      },
      exists: () => true,
      list: () => ["b", "a"],
      createReadUrl: () => "https://read.example",
      createWriteUrl: () => "https://write.example",
    };
    const runtime = layer(provider);
    const run = <A, E>(effect: Effect.Effect<A, E, BucketRuntime>) =>
      Effect.runPromise(Effect.provide(effect, runtime));
    await run(putBucketEffect("a", new Uint8Array([1])));
    expect(await run(getBucketEffect("a"))).toEqual(new Uint8Array([2]));
    expect(await run(headBucketEffect("a"))).toEqual({ etag: "abc", size: 1 });
    await run(deleteBucketEffect("a"));
    expect(await run(existsBucketEffect("a"))).toBe(true);
    expect(await run(listBucketEffect(""))).toEqual(["b", "a"]);
    expect(await run(createBucketReadUrlEffect("a"))).toBe("https://read.example");
    expect(await run(createBucketWriteUrlEffect("a"))).toBe("https://write.example");
    expect(calls).toEqual(["put:a:1", "get:a", "delete"]);
  });

  test("exposes validation, capability, declaration, and provider failures by tag", async () => {
    const provider: BucketProvider = { get: () => new Uint8Array([1]) };
    const failure = <A, E>(effect: Effect.Effect<A, E, BucketRuntime>, runtime = layer(provider)) =>
      Effect.runPromise(Effect.provide(Effect.flip(effect), runtime));
    expect(await failure(getBucketEffect("../bad"))).toBeInstanceOf(BucketValidationError);
    expect(await failure(listBucketEffect("../bad"))).toBeInstanceOf(BucketValidationError);
    expect(await failure(putBucketEffect("a", "bad" as never))).toBeInstanceOf(
      BucketValidationError,
    );
    expect(await failure(createBucketReadUrlEffect("a"))).toBeInstanceOf(BucketCapabilityError);
    expect(await failure(createBucketWriteUrlEffect("a"))).toBeInstanceOf(BucketCapabilityError);
    expect(await failure(deleteBucketEffect("a"))).toBeInstanceOf(BucketProviderError);
    expect(
      await failure(getBucketEffect("a"), layer(provider, { declared: false })),
    ).toBeInstanceOf(BucketDependencyError);
    const cause = new Error("offline");
    const unavailable = await failure(
      getBucketEffect("a"),
      layer({ get: () => Promise.reject(cause) }),
    );
    expect(unavailable).toBeInstanceOf(BucketProviderFailureError);
    expect((unavailable as BucketProviderFailureError).cause).toBe(cause);
    const malformed = await failure(getBucketEffect("a"), layer({ get: () => "bad" as never }));
    expect(malformed).toBeInstanceOf(BucketProviderFailureError);
  });

  test("types malformed results for every provider result shape", async () => {
    const provider: BucketProvider = {
      capabilities: { signedReadUrl: true, signedWriteUrl: true },
      head: () => null as never,
      exists: () => "yes" as never,
      list: () => [1] as never,
      createReadUrl: () => 1 as never,
      createWriteUrl: () => 1 as never,
    };
    const runtime = layer(provider);
    const failure = <A, E>(effect: Effect.Effect<A, E, BucketRuntime>) =>
      Effect.runPromise(Effect.provide(Effect.flip(effect), runtime));
    expect(await failure(headBucketEffect("a"))).toBeInstanceOf(BucketProviderFailureError);
    expect(await failure(existsBucketEffect("a"))).toBeInstanceOf(BucketProviderFailureError);
    expect(await failure(listBucketEffect())).toBeInstanceOf(BucketProviderFailureError);
    expect(await failure(createBucketReadUrlEffect("a"))).toBeInstanceOf(
      BucketProviderFailureError,
    );
    expect(await failure(createBucketWriteUrlEffect("a"))).toBeInstanceOf(
      BucketProviderFailureError,
    );
    expect(await failure(putBucketEffect("a", new Uint8Array()))).toBeInstanceOf(
      BucketProviderError,
    );
  });

  test("records bounded success and failure metrics", async () => {
    const provider: BucketProvider = { get: () => undefined };
    const runtime = layer(provider);
    const read = Metric.counter("relkit_bucket_operations_total", { incremental: true });
    const failed = Metric.counter("relkit_bucket_failures_total", { incremental: true });
    const duration = Metric.histogram("relkit_bucket_duration_ms", {
      boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
    });
    const result = await Effect.runPromise(
      Effect.provideService(
        Effect.gen(function* () {
          yield* Effect.provide(getBucketEffect("a"), runtime);
          yield* Effect.flip(Effect.provide(deleteBucketEffect("a"), runtime));
          return {
            reads: (yield* Metric.value(Metric.withAttributes(read, { operation: "get" }))).count,
            failures: (yield* Metric.value(Metric.withAttributes(failed, { operation: "delete" })))
              .count,
            duration: (yield* Metric.value(Metric.withAttributes(duration, { operation: "get" })))
              .count,
          };
        }),
        Metric.MetricRegistry,
        new Map(),
      ),
    );
    expect(result).toEqual({ reads: 1, failures: 1, duration: 1 });
  });

  test("accepts a deterministic telemetry Layer", async () => {
    const seen: string[] = [];
    const telemetry = Layer.succeed(
      BucketTelemetry,
      BucketTelemetry.of({
        observe: (operation, effect) => {
          seen.push(operation);
          return effect;
        },
      }),
    );
    const provider = layer({ get: () => undefined });
    const result = await Effect.runPromise(
      Effect.provide(Effect.provide(getBucketEffect("a"), provider), telemetry),
    );
    expect(result).toBeUndefined();
    expect(seen).toEqual(["get"]);
  });

  test("uses a fixed span name for bucket operations", async () => {
    const span = await Effect.runPromise(observeBucket("get", Effect.currentSpan));
    expect(span.name).toBe("bucket.get");
  });

  test("direct Effect calls retain cancellation when runtime options include a bridge", async () => {
    const controller = new AbortController();
    controller.abort();
    let started = false;
    const provider: BucketProvider = {
      get: () => {
        started = true;
        return undefined;
      },
    };
    const runtime = layer(provider, {
      signal: () => controller.signal,
      bridge: { run: async (operation) => operation() },
    });
    const error = await Effect.runPromise(
      Effect.provide(Effect.flip(getBucketEffect("a")), runtime),
    );
    expect(error).toBeInstanceOf(BucketOperationCancelledError);
    expect(started).toBe(false);
  });
});
