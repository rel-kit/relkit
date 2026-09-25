import { describe, expect, test } from "vitest";
import { Cause, Effect, Exit } from "effect";
import {
  assertBucketDescriptor,
  assertBucketDescriptorEffect,
  BucketValidationError,
  defineBucket,
  defineBucketEffect,
  isBucketDescriptor,
  isBucketDescriptorEffect,
} from "../src/define-bucket.js";

describe("bucket descriptors", () => {
  test("creates and freezes a normalized descriptor through both APIs", () => {
    const input = {
      id: "assets",
      profile: "images",
      visibility: "public" as const,
      maxObjectBytes: 1024,
      allowedContentTypes: [" image/png ", "image/jpeg"],
    };
    const result = defineBucket(input);
    expect(result.visibility).toBe("public");
    expect(result.profile).toBe("images");
    expect(result.allowedContentTypes).toEqual(["image/png", "image/jpeg"]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.allowedContentTypes)).toBe(true);
    expect(Effect.runSync(defineBucketEffect(input))).toEqual(result);
    expect(isBucketDescriptor(result)).toBe(true);
    expect(Effect.runSync(isBucketDescriptorEffect(result))).toBe(true);
    expect(() => assertBucketDescriptor(result)).not.toThrow();
    expect(Effect.runSync(assertBucketDescriptorEffect(result))).toBeUndefined();
  });

  test.each([
    [null, "Bucket options must be an object"],
    [{ id: "a", visibility: "private", handler: () => 1 }, "Buckets cannot own handlers"],
    [{ id: "a", visibility: "hidden" }, "Bucket visibility must be private or public"],
    [
      { id: "a", visibility: "private", maxObjectBytes: 0 },
      "maxObjectBytes must be a positive integer",
    ],
    [
      { id: "a", visibility: "private", allowedContentTypes: [] },
      "Bucket allowedContentTypes must not be empty",
    ],
    [
      { id: "a", visibility: "private", allowedContentTypes: "image/png" },
      "Bucket allowedContentTypes must be an array",
    ],
    [
      { id: "a", visibility: "private", allowedContentTypes: ["bad"] },
      "Invalid bucket content type",
    ],
    [
      { id: "a", visibility: "private", allowedContentTypes: ["image/png", "image/png"] },
      "Bucket allowedContentTypes must be unique",
    ],
    [{ id: "invalid id", visibility: "private" }, "Invalid stable ID"],
  ])("retains compatibility errors and typed Effect failures for %#", (value, message) => {
    expect(() => defineBucket(value as never)).toThrow(message as string);
    const failure = Effect.runSync(Effect.flip(defineBucketEffect(value as never)));
    expect(failure).toBeInstanceOf(BucketValidationError);
    expect(failure.message).toContain(message as string);
  });

  test("rejects malformed descriptor policies and profiles", () => {
    const valid = defineBucket({ id: "a", visibility: "private" });
    for (const patch of [
      { visibility: "hidden" },
      { maxObjectBytes: -1 },
      { profile: "bad id" },
      { allowedContentTypes: [] },
      { allowedContentTypes: ["image/png", "image/png"] },
      { allowedContentTypes: ["bad"] },
    ]) {
      expect(isBucketDescriptor({ ...valid, ...patch })).toBe(false);
    }
    expect(isBucketDescriptor(null)).toBe(false);
    expect(() => assertBucketDescriptor({})).toThrow("Invalid bucket descriptor");
    const failure = Effect.runSync(Effect.flip(assertBucketDescriptorEffect({})));
    expect(failure._tag).toBe("BucketValidationError");
  });

  test("preserves unexpected getter failures as defects and original adapter errors", () => {
    const unexpected = new Error("profile getter failed");
    const input = {
      id: "a",
      visibility: "private" as const,
      get profile(): string {
        throw unexpected;
      },
    };
    const exit = Effect.runSyncExit(defineBucketEffect(input));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBe(unexpected);
    try {
      defineBucket(input);
      throw new Error("Expected defineBucket to throw");
    } catch (error) {
      expect(error).toBe(unexpected);
    }
  });
});
