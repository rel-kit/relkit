import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import { deepAgentBucketLayer } from "../src/deepagent-bucket-service.js";
import type { DeepAgentBucketClient } from "../src/deepagent-bucket-files.types.js";
import { readBucketEffect, readBucketRawEffect } from "../src/deepagent-bucket-read.js";
import { writeBucketEffect } from "../src/deepagent-bucket-write.js";
import {
  downloadBucketFilesEffect,
  uploadBucketFilesEffect,
} from "../src/deepagent-bucket-transfer.js";

test("direct read and write Effects use the supplied bucket Layer", async () => {
  const objects = new Map<string, Uint8Array>();
  const bucket: DeepAgentBucketClient = {
    put: async (key, bytes) => {
      objects.set(key, bytes);
    },
    get: async (key) => objects.get(key),
    head: async (key) => (objects.has(key) ? { contentType: "text/plain" } : undefined),
    delete: async (key) => {
      objects.delete(key);
    },
    exists: async (key) => objects.has(key),
    list: async () => [...objects.keys()],
  };
  const result = await Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        yield* writeBucketEffect("/notes/a.txt", "hello\nworld");
        return yield* readBucketEffect("/notes/a.txt", 1, 1);
      }),
      deepAgentBucketLayer({ bucket, prefix: "test" }),
    ),
  );
  expect(result).toMatchObject({ content: "world", startLine: 2, endLine: 2 });
});

test("direct transfer Effects preserve file order and expose tagged IO failures", async () => {
  const objects = new Map<string, Uint8Array>();
  const failure = new Error("provider down");
  const bucket: DeepAgentBucketClient = {
    put: async (key, bytes) => {
      objects.set(key, bytes);
    },
    get: async (key) => (key.endsWith("broken") ? Promise.reject(failure) : objects.get(key)),
    head: async () => undefined,
    delete: async () => undefined,
    exists: async () => false,
    list: async () => [],
  };
  const layer = deepAgentBucketLayer({ bucket, prefix: "test" });
  const uploaded = await Effect.runPromise(
    Effect.provide(
      uploadBucketFilesEffect([
        ["/first", new Uint8Array([1])],
        ["../escape", new Uint8Array([2])],
        ["/second", new Uint8Array([3])],
      ]),
      layer,
    ),
  );
  expect(uploaded.map((entry) => entry.path)).toEqual(["/first", "../escape", "/second"]);
  const downloaded = await Effect.runPromise(
    Effect.provide(downloadBucketFilesEffect(["/second", "/first"]), layer),
  );
  expect(downloaded.map((entry) => entry.content)).toEqual([
    new Uint8Array([3]),
    new Uint8Array([1]),
  ]);
  const invalid = await Effect.runPromise(
    Effect.result(Effect.provide(readBucketEffect("../escape"), layer)),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) expect(invalid.failure._tag).toBe("DeepAgentBucketFailure");
  const failed = await Effect.runPromise(
    Effect.result(Effect.provide(readBucketEffect("/broken"), layer)),
  );
  expect(Result.isFailure(failed)).toBe(true);
  if (Result.isFailure(failed)) expect(failed.failure.cause).toBe(failure);
});

test("direct read Effects cover missing, empty, and binary files", async () => {
  const text = new TextEncoder().encode("first\nsecond\n");
  const binary = new Uint8Array([0, 1, 2]);
  const bucket: DeepAgentBucketClient = {
    get: async (key) =>
      key.endsWith("note.txt") ? text : key.endsWith("image.png") ? binary : undefined,
    head: async (key) =>
      key.endsWith("note.txt")
        ? { contentType: "text/plain" }
        : key.endsWith("image.png")
          ? { contentType: "image/png" }
          : undefined,
    put: async () => undefined,
    delete: async () => undefined,
    exists: async () => false,
    list: async () => [],
  };
  const layer = deepAgentBucketLayer({ bucket, prefix: "test" });
  const run = <A, E>(
    effect: Effect.Effect<A, E, import("../src/deepagent-bucket-service.js").DeepAgentBucket>,
  ) => Effect.runPromise(Effect.provide(effect, layer));
  expect(await run(readBucketRawEffect("/missing"))).toEqual({
    error: "File '/missing' not found",
  });
  expect(await run(readBucketEffect("/missing"))).toEqual({ error: "File '/missing' not found" });
  expect(await run(readBucketEffect("/note.txt", 9, 1))).toEqual({
    content: "",
    mimeType: "text/plain",
  });
  expect(await run(readBucketEffect("/note.txt", 0, 0))).toEqual({
    content: "",
    mimeType: "text/plain",
  });
  expect(await run(readBucketEffect("/image.png"))).toEqual({
    content: binary,
    mimeType: "image/png",
  });
});
