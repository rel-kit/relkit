import { expect, test } from "vitest";
import { Effect, Result } from "effect";
import { listDirectory } from "../src/deepagent-bucket-search.js";
import { removeBucketPath, removeBucketPathEffect } from "../src/deepagent-bucket-delete.js";
import type { DeepAgentBucketClient } from "../src/deepagent-bucket-files.js";
import { deepAgentBucketLayer } from "../src/deepagent-bucket-service.js";

test("directory metadata requests stay bounded and retain file order", async () => {
  const keys = Array.from({ length: 40 }, (_, index) => `deepagents/f${String(index).padStart(2, "0")}`);
  let active = 0;
  let peak = 0;
  const bucket: DeepAgentBucketClient = {
    list: async () => [...keys].reverse(),
    head: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return { size: 1 };
    },
    get: async () => undefined,
    put: async () => undefined,
    delete: async () => undefined,
    exists: async () => false,
  };

  const result = await listDirectory({ bucket, prefix: "deepagents" }, "/");
  expect(result).toHaveProperty("files");
  if (!("files" in result)) throw new Error("Directory listing failed");
  expect(result.files.map((file) => file.path)).toEqual(keys.map((key) => `/${key.split("/")[1]}`));
  expect(peak).toBe(8);
});

test("direct delete Effect exposes a tagged bucket failure", async () => {
  const providerError = new Error("bucket unavailable");
  const bucket: DeepAgentBucketClient = {
    list: async () => ["deepagents/one"],
    delete: async () => { throw providerError; },
    head: async () => undefined,
    get: async () => undefined,
    put: async () => undefined,
    exists: async () => false,
  };
  const result = await Effect.runPromise(
    Effect.result(Effect.provide(removeBucketPathEffect("/"), deepAgentBucketLayer({
      bucket,
      prefix: "deepagents",
    }))),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toMatchObject({ _tag: "DeepAgentBucketFailure", cause: providerError });
  }
});

test("concurrent deletes report the first key failure in input order", async () => {
  let releaseFirst = () => {};
  const firstMayFinish = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let markSecond = () => {};
  const secondFinished = new Promise<void>((resolve) => { markSecond = resolve; });
  const first = new Error("first key failed");
  const second = new Error("second key failed");
  const bucket: DeepAgentBucketClient = {
    list: async () => ["deepagents/a", "deepagents/b"],
    delete: async (key) => {
      if (key.endsWith("/a")) { await firstMayFinish; throw first; }
      markSecond();
      throw second;
    },
    head: async () => undefined,
    get: async () => undefined,
    put: async () => undefined,
    exists: async () => false,
  };
  const pending = removeBucketPath({ bucket, prefix: "deepagents" }, "/");
  await secondFinished;
  releaseFirst();
  expect(await pending).toEqual({ error: "first key failed" });
});

test("recursive delete bounds in-flight requests", async () => {
  const keys = Array.from({ length: 40 }, (_, index) => `deepagents/f${index}`);
  let active = 0;
  let peak = 0;
  const bucket: DeepAgentBucketClient = {
    list: async () => keys,
    delete: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
    },
    head: async () => undefined,
    get: async () => undefined,
    put: async () => undefined,
    exists: async () => false,
  };

  expect(await removeBucketPath({ bucket, prefix: "deepagents" }, "/")).toEqual({
    path: "/",
    filesUpdate: null,
  });
  expect(peak).toBe(8);
});
