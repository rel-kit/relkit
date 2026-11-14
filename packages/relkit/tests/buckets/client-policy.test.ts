import { describe, expect, test } from "vitest";
import { Effect, Layer } from "effect";
import {
  assertWriteUrlAllowed,
  bucketPolicyViolation,
  BucketPolicyError,
  matchesContentType,
  normalizeBucketPolicy,
  normalizeWriteUrlOptions,
  signedUploadHeaders,
} from "../../src/buckets/bucket-policy.js";
import { createBucketWriteUrlEffect, putBucketEffect } from "../../src/buckets/client-effects.js";
import { createBucketClient } from "../../src/buckets/client.js";
import { BucketRuntime } from "../../src/buckets/client-runtime.js";
import type { BucketClientOptions, BucketProvider } from "../../src/buckets/client.types.js";

const layer = (provider: BucketProvider, patch: Partial<BucketClientOptions> = {}) =>
  Layer.succeed(
    BucketRuntime,
    BucketRuntime.of({
      provider,
      options: { ownerId: "job", bucketId: "assets", source: provider, ...patch },
    }),
  );

/** A signing provider that records each call's arguments. */
function recordingProvider() {
  const calls: unknown[][] = [];
  const provider: BucketProvider = {
    capabilities: { signedWriteUrl: true },
    put: (...args: unknown[]) => void calls.push(["put", ...args]),
    createWriteUrl: (...args: unknown[]) => {
      calls.push(["createWriteUrl", ...args]);
      return "https://write.example";
    },
  };
  return { provider, calls };
}

const failure = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(effect));

describe("bucket policy", () => {
  test("normalizes limits and refuses malformed ones", () => {
    expect(normalizeBucketPolicy({})).toEqual({});
    expect(normalizeBucketPolicy({ maxObjectBytes: 5 })).toEqual({ maxObjectBytes: 5 });
    expect(normalizeBucketPolicy({ allowedContentTypes: [" Image/PNG "] })).toEqual({
      allowedContentTypes: ["image/png"],
    });
    for (const policy of [
      { maxObjectBytes: 0 },
      { maxObjectBytes: 1.5 },
      { allowedContentTypes: [] },
      { allowedContentTypes: "image/png" as never },
      { allowedContentTypes: ["image"] },
      { allowedContentTypes: [1 as never] },
      { allowedContentTypes: ["image/png", "IMAGE/png"] },
    ])
      expect(() => normalizeBucketPolicy(policy)).toThrow(BucketPolicyError);
  });

  test("validates a signed upload declaration", () => {
    expect(normalizeWriteUrlOptions(undefined)).toEqual({});
    expect(normalizeWriteUrlOptions({ contentType: " image/PNG ", contentLength: 0 })).toEqual({
      contentType: "image/PNG",
      contentLength: 0,
    });
    for (const options of [
      null,
      [],
      { contentType: "image/*" },
      { contentType: "png" },
      { contentType: 1 },
      { contentLength: -1 },
      { contentLength: 1.5 },
    ])
      expect(() => normalizeWriteUrlOptions(options as never)).toThrow(BucketPolicyError);
  });

  test("names the rule an object breaks", () => {
    const policy = normalizeBucketPolicy({
      maxObjectBytes: 4,
      allowedContentTypes: ["image/*", "text/plain"],
    });
    expect(bucketPolicyViolation(policy, { size: 5 })).toBe("Bucket object exceeds maxObjectBytes");
    expect(bucketPolicyViolation(policy, { size: 4 })).toBe("Bucket content type is not allowed");
    expect(bucketPolicyViolation(policy, { size: 4, typeOptional: true })).toBeUndefined();
    expect(bucketPolicyViolation(policy, { contentType: "IMAGE/png" })).toBeUndefined();
    expect(bucketPolicyViolation(policy, { contentType: "text/html" })).toBe(
      "Bucket content type is not allowed",
    );
    expect(bucketPolicyViolation({}, { size: 10 })).toBeUndefined();
    expect(matchesContentType("application/json", "*/*")).toBe(true);
    expect(matchesContentType("text/plain", "text/plain")).toBe(true);
    expect(matchesContentType("textual/plain", "text/*")).toBe(false);
  });

  test("checks a signed upload before signing and lists the headers it binds", () => {
    const policy = normalizeBucketPolicy({ maxObjectBytes: 4, allowedContentTypes: ["image/png"] });
    expect(assertWriteUrlAllowed(policy, undefined)).toEqual({});
    expect(() => assertWriteUrlAllowed(policy, { contentLength: 5 })).toThrow(
      "Bucket object exceeds maxObjectBytes",
    );
    expect(() => assertWriteUrlAllowed(policy, { contentType: "text/plain" })).toThrow(
      BucketPolicyError,
    );
    expect(signedUploadHeaders({})).toEqual({});
    expect(signedUploadHeaders({ contentType: "image/png", contentLength: 4 })).toEqual({
      "content-type": "image/png",
      "content-length": "4",
    });
    expect(new BucketPolicyError("x")).toMatchObject({
      code: "RELKIT_BUCKET_POLICY_INVALID",
      name: "BucketPolicyError",
    });
  });
});

describe("bucket client policy", () => {
  test("passes a declaration to the provider and keeps the old call shape without one", async () => {
    const { provider, calls } = recordingProvider();
    const run = <A, E>(effect: Effect.Effect<A, E, BucketRuntime>) =>
      Effect.runPromise(Effect.provide(effect, layer(provider)));
    await run(createBucketWriteUrlEffect("a.png"));
    await run(createBucketWriteUrlEffect("a.png", { contentType: "image/png", contentLength: 4 }));
    expect(calls.map((call) => call.length)).toEqual([3, 4]);
    expect(calls[1]![3]).toEqual({ contentType: "image/png", contentLength: 4 });
  });

  test("refuses what the declared policy does not allow before the provider is called", async () => {
    const { provider, calls } = recordingProvider();
    const limited = layer(provider, {
      policy: { maxObjectBytes: 4, allowedContentTypes: ["image/png"] },
    });
    const refused = [
      createBucketWriteUrlEffect("a.exe", { contentType: "application/x-msdownload" }),
      createBucketWriteUrlEffect("a.png", { contentType: "image/png", contentLength: 5 }),
      createBucketWriteUrlEffect("a.png", { contentLength: -1 }),
      putBucketEffect("a.png", new Uint8Array(5), { contentType: "image/png" }),
      putBucketEffect("a.png", new Uint8Array(1)),
    ];
    for (const effect of refused)
      expect(await failure(Effect.provide(effect, limited))).toBeInstanceOf(BucketPolicyError);
    expect(calls).toEqual([]);
    const malformed = layer(provider, { policy: { maxObjectBytes: -1 } });
    expect(
      await failure(Effect.provide(putBucketEffect("a.png", new Uint8Array(1)), malformed)),
    ).toBeInstanceOf(BucketPolicyError);
    await Effect.runPromise(
      Effect.provide(
        putBucketEffect("a.png", new Uint8Array(4), { contentType: "image/png" }),
        limited,
      ),
    );
    expect(calls).toHaveLength(1);
  });

  test("the Promise client forwards the declaration and rejects with the policy error", async () => {
    const { provider, calls } = recordingProvider();
    const client = createBucketClient({
      ownerId: "job",
      bucketId: "assets",
      source: provider,
      policy: { allowedContentTypes: ["image/png"] },
    });
    expect(await client.createWriteUrl("a.png", { contentType: "image/png" })).toBe(
      "https://write.example",
    );
    await expect(
      client.createWriteUrl("a.exe", { contentType: "application/x-msdownload" }),
    ).rejects.toBeInstanceOf(BucketPolicyError);
    expect(calls).toHaveLength(1);
  });
});
