/** Exercises catch-all paths and file validation without changing resource ownership. */
import { expect } from "bun:test";
import { Effect } from "effect";
import type { CommerceHttpFixture } from "./commerce-http.types.ts";
/**
 * Checks required and optional catch-all decoding.
 * @param fixture - Native route client.
 * @returns Completion after unchanged navigation outputs are asserted.
 */
export const verifyNavigation = Effect.fn("test.commerce.http.paths")(function* ({
  client,
}: CommerceHttpFixture) {
  for (const [path, result] of [
    ["/files/a%20b/c%2Fd", "/a b/c/d"],
    ["/docs", "/"],
    ["/docs/guides/start", "/guides/start"],
  ] as const) {
    const response = yield* Effect.tryPromise(() => client.get(path));
    expect(yield* Effect.tryPromise(() => response.json())).toEqual({ path: result });
  }
});
/**
 * Checks multipart success and the declared bucket's actual keys.
 * @param fixture - Native client and bucket observer.
 * @returns Completion after upload settles.
 */
export const verifyUpload = Effect.fn("test.commerce.http.upload")(function* ({
  client,
  uploadedKeys,
}: CommerceHttpFixture) {
  const upload = new FormData();
  upload.append("label", "receipts");
  upload.append("primary", new File(["primary"], "primary.png", { type: "image/png" }));
  upload.append("attachments", new File(["one"], "one.png", { type: "image/png" }));
  upload.append("attachments", new File(["two"], "two.png", { type: "image/png" }));
  const uploaded = yield* Effect.tryPromise(() => client.post("/uploads", { body: upload }));
  expect(uploaded.status).toBe(200);
  expect(yield* Effect.tryPromise(() => uploaded.json())).toEqual({
    label: "receipts",
    files: ["primary.png", "one.png", "two.png"],
  });
  expect(uploadedKeys).toEqual(["primary.png", "one.png", "two.png"]);
});
/**
 * Checks media restrictions, bounded errors and file-size limits.
 * @param fixture - Native route client.
 * @returns Completion after both rejected requests settle.
 */
export const verifyInvalidUploads = Effect.fn("test.commerce.http.invalidUpload")(function* ({
  client,
}: CommerceHttpFixture) {
  const invalidUpload = new FormData();
  invalidUpload.append("label", "receipts");
  invalidUpload.append("primary", new File(["image"], "image.png", { type: "image/png" }));
  invalidUpload.append("attachments", new File(["ok"], "ok.txt", { type: "text/plain" }));
  const invalid = yield* Effect.tryPromise(() => client.post("/uploads", { body: invalidUpload }));
  expect(invalid.status).toBe(422);
  expect(JSON.stringify(yield* Effect.tryPromise(() => invalid.json())).length).toBeLessThan(1024);
  const oversizedUpload = new FormData();
  oversizedUpload.append("label", "large");
  oversizedUpload.append(
    "primary",
    new File(["x".repeat(11 * 1024 * 1024)], "large.png", { type: "image/png" }),
  );
  const oversized = yield* Effect.tryPromise(() =>
    client.post("/uploads", { body: oversizedUpload }),
  );
  expect(oversized.status).toBe(422);
});
