import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  bucketKeyEffect,
  createBucketContextEffect,
  filePathEffect,
  virtualPath,
  virtualPathEffect,
} from "../src/deepagent-bucket-files.js";
import {
  errorMessageEffect,
  isControlFailureEffect,
  isTextMimeTypeEffect,
  normalizedPageEffect,
} from "../src/deepagent-bucket-format.js";

test("bucket helper Effects normalize paths and format results", () => {
  const bucket = { put() {}, get() {}, head() {}, delete() {}, exists() {}, list() {} } as never;
  const context = Effect.runSync(createBucketContextEffect(bucket, "agents"));
  expect(Effect.runSync(virtualPathEffect("docs/./readme.md"))).toBe("/docs/readme.md");
  expect(Effect.runSync(bucketKeyEffect(context, "/readme.md"))).toBe("agents/readme.md");
  expect(Effect.runSync(filePathEffect(context, "agents/readme.md"))).toBe("/readme.md");
  expect(Effect.runSync(normalizedPageEffect(-3, 2.8))).toEqual({ offset: 0, limit: 2 });
  expect(Effect.runSync(isControlFailureEffect({ code: "ABORT_ERR" }))).toBe(true);
  expect(Effect.runSync(errorMessageEffect(new Error("failed")))).toBe("failed");
  expect(Effect.runSync(isTextMimeTypeEffect("text/plain"))).toBe(true);
});

test("bucket path Effect tags traversal and adapter keeps original error", () => {
  const failure = Effect.runSync(Effect.result(virtualPathEffect("../secret")));
  expect(Result.isFailure(failure)).toBe(true);
  if (Result.isFailure(failure)) expect(failure.failure._tag).toBe("DeepAgentBucketFailure");
  expect(() => virtualPath("../secret")).toThrow("Path traversal not allowed");
});
