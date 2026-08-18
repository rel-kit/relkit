import { createHash } from "node:crypto";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  createLocalBucketProviderForTest,
  LocalBucketKeyError,
  LocalBucketPolicyError,
  type LocalBucketProviderOptions,
  type LocalBucketProvider,
} from "./src/buckets/index.ts";

const roots: string[] = [];

describe("local bucket provider", () => {
  test("round-trips bytes and metadata with a stable content hash", async () => {
    const provider = await makeProvider();
    const bytes = new Uint8Array([1, 2, 3]);
    await provider.put("assets/item.bin", bytes, {
      contentType: "application/octet-stream",
      metadata: { uploadedBy: "test" },
    });
    bytes[0] = 9;

    const expectedHash = `sha256:${createHash("sha256")
      .update(new Uint8Array([1, 2, 3]))
      .digest("hex")}`;
    expect(await provider.get("assets/item.bin")).toEqual(new Uint8Array([1, 2, 3]));
    expect(await provider.head("assets/item.bin")).toEqual({
      etag: expectedHash,
      contentHash: expectedHash,
      contentType: "application/octet-stream",
      size: 3,
      metadata: { uploadedBy: "test" },
    });
    expect(await provider.list("assets/")).toEqual(["assets/item.bin"]);
    expect(provider.capabilities).toEqual({ signedReadUrl: false, signedWriteUrl: false });
  });

  test("rejects path escapes and enforces size/content-type policy", async () => {
    const provider = await makeProvider({
      maxObjectBytes: 3,
      allowedContentTypes: ["image/*"],
    });
    const unsafe = [
      "../outside",
      "/absolute",
      "C:/absolute",
      "nested\\escape",
      "nested/../escape",
      ".zsys/internal",
      "__zsys/internal",
      "null\0byte",
    ];
    for (const key of unsafe) {
      await expect(
        provider.put(key, new Uint8Array([1]), { contentType: "image/png" }),
      ).rejects.toBeInstanceOf(LocalBucketKeyError);
    }
    await expect(
      provider.put("image.png", new Uint8Array([1, 2, 3, 4]), { contentType: "image/png" }),
    ).rejects.toBeInstanceOf(LocalBucketPolicyError);
    await expect(
      provider.put("image.png", new Uint8Array([1]), { contentType: "text/plain" }),
    ).rejects.toBeInstanceOf(LocalBucketPolicyError);
    await expect(access(join(roots[roots.length - 1]!, "outside"))).rejects.toThrow();
  });

  test("paginates sorted keys and reopens committed state", async () => {
    const provider = await makeProvider();
    await provider.put("a", new Uint8Array([1]));
    await provider.put("b", new Uint8Array([2]));
    await provider.put("c", new Uint8Array([3]));

    const first = await provider.listPage(undefined, { limit: 2 });
    expect(first.items).toEqual(["a", "b"]);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await provider.listPage(undefined, { cursor: first.nextCursor!, limit: 2 });
    expect(second).toEqual({ items: ["c"] });

    const reopened = await createLocalBucketProviderForTest(provider.root);
    expect(await reopened.get("b")).toEqual(new Uint8Array([2]));
    const files = await readdir(join(provider.root, "objects"));
    expect(files.every((file) => !file.startsWith(".zsys-tmp-"))).toBe(true);
  });

  test("reports signed URL support explicitly instead of simulating it", async () => {
    const provider = await makeProvider();
    await expect(provider.createReadUrl("asset.bin")).rejects.toMatchObject({
      code: "ZSYS_BUCKET_CAPABILITY_UNSUPPORTED",
      capability: "signedReadUrl",
    });
    await expect(provider.createWriteUrl("asset.bin")).rejects.toMatchObject({
      code: "ZSYS_BUCKET_CAPABILITY_UNSUPPORTED",
      capability: "signedWriteUrl",
    });
  });
});

async function makeProvider(
  options: Partial<LocalBucketProviderOptions> = {},
): Promise<LocalBucketProvider> {
  const root = await mkdtemp(join(tmpdir(), "zsys-bucket-"));
  roots.push(root);
  return createLocalBucketProviderForTest({ ...options, root });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
