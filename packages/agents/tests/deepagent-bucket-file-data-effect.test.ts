import { Clock, Effect, Result } from "effect";
import { expect, test } from "vitest";
import { putFileDataEffect, readFileDataEffect } from "../src/deepagent-bucket-file-data.js";
import type { DeepAgentBucketClient, DeepAgentBucketMetadata } from "../src/deepagent-bucket-files.types.js";
import { deepAgentBucketLayer } from "../src/deepagent-bucket-service.js";

test("file data Effects use a substituted clock and bucket service", async () => {
  let stored: Uint8Array | undefined;
  let metadata: DeepAgentBucketMetadata | undefined;
  const bucket: DeepAgentBucketClient = {
    get: async () => stored,
    head: async () => metadata,
    put: async (_key, bytes, options) => {
      stored = bytes;
      metadata = { contentType: options?.contentType, metadata: options?.metadata };
    },
    delete: async () => undefined,
    exists: async () => false,
    list: async () => [],
  };
  const now = Date.parse("2025-01-02T03:04:05.000Z");
  const clock: Clock.Clock = {
    currentTimeMillisUnsafe: () => now,
    currentTimeMillis: Effect.succeed(now),
    currentTimeNanosUnsafe: () => BigInt(now) * 1_000_000n,
    currentTimeNanos: Effect.succeed(BigInt(now) * 1_000_000n),
    monotonicTimeNanosUnsafe: () => 0n,
    monotonicTimeNanos: Effect.succeed(0n),
    sleep: () => Effect.void,
  };
  const context = { bucket, prefix: "deepagents" };
  const operation = Effect.gen(function* () {
    yield* putFileDataEffect("/note.md", "hello");
    return yield* readFileDataEffect("/note.md");
  });
  const result = await Effect.runPromise(
    Effect.provideService(Effect.provide(operation, deepAgentBucketLayer(context)), Clock.Clock, clock),
  );
  expect(result).toMatchObject({
    content: "hello",
    mimeType: "text/markdown",
    created_at: "2025-01-02T03:04:05.000Z",
    modified_at: "2025-01-02T03:04:05.000Z",
  });
});

test("file data Effect reports invalid paths as tagged failures", async () => {
  const bucket: DeepAgentBucketClient = {
    get: async () => undefined,
    head: async () => undefined,
    put: async () => undefined,
    delete: async () => undefined,
    exists: async () => false,
    list: async () => [],
  };
  const result = await Effect.runPromise(Effect.result(
    Effect.provide(readFileDataEffect("../escape"), deepAgentBucketLayer({ bucket, prefix: "deepagents" })),
  ));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toMatchObject({ _tag: "DeepAgentBucketFailure" });
  }
});
