import { expect, test } from "bun:test";
import { BucketPolicyError } from "relkit/buckets";
import { createCloudflareR2BucketProvider } from "./src/runtime/index.ts";

const requests: string[] = [];
const provider = createCloudflareR2BucketProvider({
  accountId: "account",
  bucketName: "assets",
  accessKeyId: "access",
  secretAccessKey: "secret",
  maxObjectBytes: 10,
  allowedContentTypes: ["image/png"],
  fetch: (async (input: string | URL | Request) => {
    requests.push(String(input));
    return new Response(null, { status: 200 });
  }) as typeof fetch,
});

const signedHeaders = (url: string) => new URL(url).searchParams.get("X-Amz-SignedHeaders");

test("an R2 write URL binds the declared content type and length", async () => {
  expect(signedHeaders(await provider.createWriteUrl!("a.png"))).toBe("host");
  const url = await provider.createWriteUrl!("a.png", undefined, {
    contentType: "image/png",
    contentLength: 10,
  });
  expect(signedHeaders(url)).toBe("content-length;content-type;host");
});

test("an R2 write URL or put the bucket does not allow is refused before any request", async () => {
  requests.length = 0;
  for (const attempt of [
    provider.createWriteUrl!("a.exe", undefined, { contentType: "application/x-msdownload" }),
    provider.createWriteUrl!("a.png", undefined, { contentType: "image/png", contentLength: 11 }),
    provider.put!("a.png", new Uint8Array(11), { contentType: "image/png" }),
    provider.put!("a.exe", new Uint8Array(1), { contentType: "application/x-msdownload" }),
  ])
    expect(
      await attempt.then(
        () => undefined,
        (cause: unknown) => cause,
      ),
    ).toBeInstanceOf(BucketPolicyError);
  expect(requests).toEqual([]);
});
