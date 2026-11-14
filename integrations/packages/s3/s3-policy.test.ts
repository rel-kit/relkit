import { expect, test } from "bun:test";
import { BucketPolicyError } from "relkit/buckets";
import { createS3BucketProvider } from "./src/runtime/index.ts";

const requests: string[] = [];
const provider = createS3BucketProvider({
  endpoint: "http://127.0.0.1:9000",
  bucketName: "assets",
  region: "us-east-1",
  credentials: { accessKeyId: "test-access-key", secretAccessKey: "test-secret-key" },
  forcePathStyle: true,
  maxObjectBytes: 10,
  allowedContentTypes: ["image/png", "text/*"],
  fetch: (async (input: string | URL | Request) => {
    requests.push(String(input));
    return new Response(null, { status: 200 });
  }) as typeof fetch,
});

const signedHeaders = (url: string) => new URL(url).searchParams.get("X-Amz-SignedHeaders");

test("a write URL without a declaration signs the host only, as before", async () => {
  expect(signedHeaders(await provider.createWriteUrl!("a.png"))).toBe("host");
});

test("a write URL binds the declared content type and exact length", async () => {
  const typed = await provider.createWriteUrl!("a.png", undefined, { contentType: "image/png" });
  expect(signedHeaders(typed)).toBe("content-type;host");
  const sized = await provider.createWriteUrl!("a.png", undefined, {
    contentType: "image/png",
    contentLength: 10,
  });
  expect(signedHeaders(sized)).toBe("content-length;content-type;host");
});

test("a write URL for a type or size the bucket does not allow is refused before signing", async () => {
  const refused = [
    provider.createWriteUrl!("a.exe", undefined, { contentType: "application/x-msdownload" }),
    provider.createWriteUrl!("a.png", undefined, { contentType: "image/png", contentLength: 11 }),
    provider.createWriteUrl!("a.png", undefined, { contentLength: -1 }),
    provider.createWriteUrl!("a.png", undefined, { contentType: "image/*" }),
  ];
  for (const attempt of refused) {
    const error = await attempt.then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(BucketPolicyError);
    expect(error).toMatchObject({ code: "RELKIT_BUCKET_POLICY_INVALID" });
  }
});

test("put applies the bucket's limits before any request", async () => {
  requests.length = 0;
  const bytes = (size: number) => new Uint8Array(size);
  await expect(provider.put!("a.png", bytes(11), { contentType: "image/png" })).rejects.toThrow(
    "Bucket object exceeds maxObjectBytes",
  );
  await expect(
    provider.put!("a.exe", bytes(4), { contentType: "application/x-msdownload" }),
  ).rejects.toThrow("Bucket content type is not allowed");
  await expect(provider.put!("a.bin", bytes(4))).rejects.toBeInstanceOf(BucketPolicyError);
  expect(requests).toEqual([]);
  await provider.put!("a.txt", bytes(10), { contentType: "text/plain" });
  expect(requests).toHaveLength(1);
});

test("a malformed limit is refused when the provider is created", () => {
  expect(() =>
    createS3BucketProvider({
      endpoint: "http://127.0.0.1:9000",
      bucketName: "assets",
      region: "us-east-1",
      maxObjectBytes: 0,
    }),
  ).toThrow(BucketPolicyError);
});
