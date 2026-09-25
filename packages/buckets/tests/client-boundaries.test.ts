import { describe, expect, test } from "vitest";
import { Effect, Metric } from "effect";
import {
  BucketOperationCancelledError,
  BucketOperationTimeoutError,
  BucketProviderError,
  BucketProviderFailureError,
} from "../src/client-errors.js";
import { createBucketClient } from "../src/client.js";
import { createBucketClientEffect } from "../src/client.js";
import { asProvider, asProviderEffect, bucketRuntimeLayer } from "../src/client-runtime.js";
import { BucketValidationError } from "../src/bucket-validation-error.js";
import { getBucketEffect } from "../src/client-effects.js";
import type { BucketOperationObservation, BucketProvider } from "../src/client.types.js";

describe("bucket compatibility boundaries", () => {
  test("validates owner and source before returning a client", () => {
    for (const invalid of [null, undefined, []]) {
      expect(() => createBucketClient(invalid as never)).toThrow(
        "Bucket client options must be an object",
      );
      const error = Effect.runSync(Effect.flip(createBucketClientEffect(invalid as never)));
      expect(error).toBeInstanceOf(BucketValidationError);
    }
    expect(() => createBucketClient({ ownerId: "", bucketId: "a", source: {} })).toThrow(
      "Bucket ownerId must be non-empty",
    );
    expect(() => createBucketClient({ ownerId: "a", bucketId: " ", source: {} })).toThrow(
      "Bucket bucketId must be non-empty",
    );
    expect(() => createBucketClient({ ownerId: "a", bucketId: "b", source: 1 })).toThrow(
      BucketProviderError,
    );
    const client = createBucketClient({ ownerId: "a", bucketId: "b", source: undefined });
    expect(Object.isFrozen(client)).toBe(true);
    expect(asProvider(undefined)).toEqual({});
    expect(asProvider({ get: () => undefined }).get).toBeTypeOf("function");
    expect(() => asProvider(null)).toThrow(BucketProviderError);
    expect(Effect.runSync(Effect.flip(asProviderEffect(null)))).toBeInstanceOf(BucketProviderError);
    const failure = Effect.runSync(
      Effect.flip(
        createBucketClientEffect({
          ownerId: "",
          bucketId: "a",
          source: {},
        }),
      ),
    );
    expect(failure).toBeInstanceOf(BucketValidationError);
  });

  test.each([
    "",
    "a//b",
    "../b",
    "/a",
    "C:/a",
    "a\\b",
    "a\0b",
    ".relkit/a",
    "__relkit/a",
    "x".repeat(4097),
  ])("rejects invalid portable key %# synchronously", (key) => {
    const client = createBucketClient({ ownerId: "a", bucketId: "b", source: {} });
    expect(() => client.get(key)).toThrow(TypeError);
    expect(() => client.put(key, new Uint8Array())).toThrow(TypeError);
  });

  test("rejects malformed provider results and retains compatibility errors", async () => {
    const cases: [keyof BucketProvider, () => Promise<unknown>, string][] = [];
    const source: BucketProvider = {
      get: () => "bad" as never,
      head: () => "bad" as never,
      exists: () => "bad" as never,
      list: () => [1] as never,
      capabilities: { signedReadUrl: true },
      createReadUrl: () => 1 as never,
    };
    const client = createBucketClient({ ownerId: "a", bucketId: "b", source });
    cases.push(["get", () => client.get("a"), "Bucket get must return bytes or undefined"]);
    cases.push(["head", () => client.head("a"), "Bucket head must return metadata or undefined"]);
    cases.push(["exists", () => client.exists("a"), "Bucket exists must return a boolean"]);
    cases.push(["list", () => client.list(), "Bucket list must return string keys"]);
    cases.push(["createReadUrl", () => client.createReadUrl("a"), "Bucket URL must be a string"]);
    for (const [, call, message] of cases) await expect(call()).rejects.toThrow(message);
    await expect(client.put("a", "bad" as never)).rejects.toThrow(
      "Bucket bytes must be a Uint8Array",
    );

    expect(() => client.list("a//")).toThrow(TypeError);
    expect(() => client.get(1 as never)).toThrow("Bucket key must be a string");
  });

  test("counts synchronous adapter validation failures", () => {
    const client = createBucketClient({ ownerId: "a", bucketId: "b", source: {} });
    const failures = Metric.withAttributes(
      Metric.counter("relkit_bucket_failures_total", { incremental: true }),
      { operation: "get" },
    );
    const before = Effect.runSync(Metric.value(failures)).count;
    expect(() => client.get("../bad")).toThrow(TypeError);
    expect(Effect.runSync(Metric.value(failures)).count).toBe(before + 1);
  });

  test("reports provider failures and advisory hook exceptions without changing results", async () => {
    const observations: BucketOperationObservation[] = [];
    const offline = new Error("offline");
    const client = createBucketClient({
      ownerId: "a",
      bucketId: "b",
      source: { get: () => Promise.reject(offline) },
      onObservedEdge: () => {
        throw new Error("observer");
      },
      onOperation: (value) => {
        observations.push(value);
        throw new Error("observer");
      },
    });
    await expect(client.get("a")).rejects.toBe(offline);
    expect(observations[0]?.outcome).toBe("provider-failure");
  });

  test.each(["before", "after", "sync"])(
    "reports a bridge rejection %s provider execution as a failed operation",
    async (phase) => {
      const edges: unknown[] = [];
      const observations: BucketOperationObservation[] = [];
      let providerCalls = 0;
      const failure = new Error("bridge failed");
      const client = createBucketClient({
        ownerId: "a",
        bucketId: "b",
        source: { get: () => (providerCalls++, undefined) },
        bridge: {
          run: (operation) => {
            if (phase === "sync") throw failure;
            return (async () => {
              if (phase === "after") await operation();
              throw failure;
            })();
          },
        },
        onObservedEdge: (edge) => edges.push(edge),
        onOperation: (observation) => observations.push(observation),
      });

      await expect(client.get("a")).rejects.toBe(failure);
      expect(providerCalls).toBe(phase === "after" ? 1 : 0);
      expect(edges).toHaveLength(1);
      expect(observations).toMatchObject([{ operation: "get", outcome: "provider-failure" }]);
    },
  );

  test("classifies AbortError and TimeoutError from providers", async () => {
    for (const [name, outcome] of [
      ["AbortError", "cancelled"],
      ["TimeoutError", "timeout"],
    ]) {
      const observations: BucketOperationObservation[] = [];
      const error = Object.assign(new Error("provider"), { name });
      const client = createBucketClient({
        ownerId: "a",
        bucketId: "b",
        source: { get: () => Promise.reject(error) },
        onOperation: (value) => observations.push(value),
      });
      await expect(client.get("a")).rejects.toBe(error);
      expect(observations[0]?.outcome).toBe(outcome);
    }
  });

  test("supports a substitute runtime Layer and typed provider failures", async () => {
    const layer = bucketRuntimeLayer({
      ownerId: "a",
      bucketId: "b",
      source: { get: () => undefined },
    });
    expect(await Effect.runPromise(Effect.provide(getBucketEffect("a"), layer))).toBeUndefined();
    const failed = bucketRuntimeLayer({
      ownerId: "a",
      bucketId: "b",
      source: { get: () => "bad" as never },
    });
    const error = await Effect.runPromise(
      Effect.provide(Effect.flip(getBucketEffect("a")), failed),
    );
    expect(error).toBeInstanceOf(BucketProviderFailureError);
    expect(() => new BucketOperationCancelledError().message).not.toThrow();
    expect(() => new BucketOperationTimeoutError().message).not.toThrow();
  });

  test("preserves capability, dependency, and missing method error messages", async () => {
    const capability = createBucketClient({ ownerId: "a", bucketId: "b", source: {} });
    await expect(capability.createReadUrl("a")).rejects.toMatchObject({
      code: "RELKIT_BUCKET_CAPABILITY_UNSUPPORTED",
      message: 'Bucket operation "createReadUrl" requires unsupported capability "signedReadUrl"',
    });
    const dependency = createBucketClient({
      ownerId: "a",
      bucketId: "b",
      source: {},
      declared: false,
    });
    await expect(dependency.get("a")).rejects.toMatchObject({
      code: "RELKIT_BUCKET_DEPENDENCY_UNDECLARED",
      message: 'Bucket dependency "b" is not declared on this function',
    });
    await expect(capability.get("a")).rejects.toMatchObject({
      code: "RELKIT_BUCKET_PROVIDER_UNAVAILABLE",
      message: 'Bucket provider does not implement "get"',
    });
  });
});
