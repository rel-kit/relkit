import { describe, expect, test } from "bun:test";
import {
  createBucketClient,
  type BucketCapabilities,
  type BucketProvider,
} from "../../packages/buckets/src/index.ts";

export interface BucketFailureControls {
  readonly once: (point: string, cause?: unknown) => void;
}

export interface BucketContractOptions {
  readonly maxObjectBytes?: number;
  readonly allowedContentTypes?: readonly string[];
}

export interface BucketContractHarness {
  readonly provider: BucketProvider;
  readonly capabilities: BucketCapabilities;
  readonly close: () => Promise<void>;
  readonly listPage?: (
    prefix?: string,
    options?: { readonly cursor?: string; readonly limit?: number },
  ) => Promise<{ readonly items: readonly string[]; readonly nextCursor?: string }>;
  readonly failures?: BucketFailureControls;
}

export interface BucketContractTarget {
  readonly name: string;
  readonly features: {
    readonly atomicFailureInjection: boolean;
    readonly pagination: boolean;
  };
  readonly create: (options?: BucketContractOptions) => Promise<BucketContractHarness>;
}

export function registerBucketContractSuite(target: BucketContractTarget): void {
  describe.serial(`bucket contract: ${target.name}`, () => {
    test("round-trips every operation and metadata", async () => {
      await withBucket(target, async ({ client }) => {
        const original = new Uint8Array([1, 2, 3]);
        await client.put("assets/item.bin", original, {
          contentType: "application/octet-stream",
          metadata: { "uploaded-by": "contract", visibility: "private" },
        });
        original[0] = 9;

        expect(await client.exists("assets/item.bin")).toBe(true);
        expect(await client.get("assets/item.bin")).toEqual(new Uint8Array([1, 2, 3]));
        expect(await client.head("assets/item.bin")).toMatchObject({
          contentType: "application/octet-stream",
          contentHash: expect.stringMatching(/^sha256:/),
          etag: expect.stringMatching(/^sha256:/),
          metadata: { "uploaded-by": "contract", visibility: "private" },
          size: 3,
        });
        expect(await client.list("assets/")).toEqual(["assets/item.bin"]);

        await client.delete("assets/item.bin");
        expect(await client.exists("assets/item.bin")).toBe(false);
        expect(await client.get("assets/item.bin")).toBeUndefined();
        expect(await client.head("assets/item.bin")).toBeUndefined();
      });
    });

    test("rejects traversal, absolute keys, and policy violations", async () => {
      await withBucket(
        target,
        async ({ client }) => {
          for (const key of [
            "../outside",
            "/absolute",
            "C:/absolute",
            "nested\\escape",
            "nested/../escape",
            ".relkit/internal",
            "__relkit/internal",
            "null\0byte",
          ]) {
            await expectFailure(() => client.put(key, new Uint8Array([1])));
            await expectFailure(() => client.get(key));
            await expectFailure(() => client.head(key));
            await expectFailure(() => client.exists(key));
            await expectFailure(() => client.delete(key));
          }
          await expectFailure(() => client.list("../"));
        },
        { maxObjectBytes: 3, allowedContentTypes: ["image/png"] },
      );
    });

    test("reports signed URL support through capabilities", async () => {
      await withBucket(target, async ({ client, capabilities }) => {
        if (capabilities.signedReadUrl) {
          expect(typeof (await client.createReadUrl("asset.bin"))).toBe("string");
        } else {
          await expect(client.createReadUrl("asset.bin")).rejects.toMatchObject({
            code: "RELKIT_BUCKET_CAPABILITY_UNSUPPORTED",
            capability: "signedReadUrl",
            operation: "createReadUrl",
          });
        }
        if (capabilities.signedWriteUrl) {
          expect(typeof (await client.createWriteUrl("asset.bin"))).toBe("string");
        } else {
          await expect(client.createWriteUrl("asset.bin")).rejects.toMatchObject({
            code: "RELKIT_BUCKET_CAPABILITY_UNSUPPORTED",
            capability: "signedWriteUrl",
            operation: "createWriteUrl",
          });
        }
      });
    });

    test("rejects operations after the provider goes out of service", async () => {
      await withBucket(target, async ({ client, close }) => {
        await client.put("outage", new Uint8Array([1]));
        await close();
        await expect(client.get("outage")).rejects.toThrow();
      });
    });

    if (target.features.atomicFailureInjection) {
      test("keeps the prior object visible across injected write failures", async () => {
        await withBucket(target, async ({ client, failures }) => {
          expect(failures).toBeDefined();
          await client.put("atomic", new Uint8Array([1]));

          failures!.once("bucket.before-write");
          await expect(client.put("atomic", new Uint8Array([2]))).rejects.toThrow();
          expect(await client.get("atomic")).toEqual(new Uint8Array([1]));

          failures!.once("bucket.after-write-before-ack");
          await expect(client.put("atomic", new Uint8Array([3]))).rejects.toThrow();
          expect(await client.get("atomic")).toEqual(new Uint8Array([3]));
        });
      });
    }

    if (target.features.pagination) {
      test("returns sorted, cursor-based pages without duplicates", async () => {
        await withBucket(target, async ({ client, listPage }) => {
          expect(listPage).toBeDefined();
          for (const key of ["items/c", "items/a", "items/d", "items/b"]) {
            await client.put(key, new Uint8Array([1]));
          }

          const first = await listPage!("items/", { limit: 2 });
          const second = await listPage!("items/", { cursor: first.nextCursor, limit: 2 });
          expect(first.items).toEqual(["items/a", "items/b"]);
          expect(second).toEqual({ items: ["items/c", "items/d"] });
        });
      });
    }
  });
}

async function expectFailure(work: () => unknown): Promise<void> {
  await expect(Promise.resolve().then(work)).rejects.toThrow();
}

async function withBucket(
  target: BucketContractTarget,
  run: (
    value: BucketContractHarness & { readonly client: ReturnType<typeof createBucketClient> },
  ) => Promise<void>,
  options?: BucketContractOptions,
): Promise<void> {
  const harness = await target.create(options);
  const client = createBucketClient({
    ownerId: "contracts.bucket",
    bucketId: "contract",
    source: harness.provider,
  });
  try {
    await run({ ...harness, client });
  } finally {
    await harness.close();
  }
}
