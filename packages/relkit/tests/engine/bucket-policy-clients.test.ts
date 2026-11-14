/**
 * Declared bucket limits reach the bucket clients the engine builds. An authored `defineBucket`
 * descriptor carries its own limits; a bare reference gets them from the application graph, which
 * a generated server binds to the bucket's source with `bindBucketPolicy`. A refused upload never
 * reaches the provider, an allowed one does, and a bucket without limits behaves as before.
 */
import { describe, expect, test } from "vitest";
import { defineBucket } from "../../src/buckets/index.js";
import * as dependencies from "../../src/engine/dependencies.js";
import type { DependencyRefLike } from "../../src/engine/dependencies.js";

const BUCKET_ID = "media.uploads";
const LIMITS = { allowedContentTypes: ["image/png"], maxObjectBytes: 1000 } as const;

/** The bucket client operations these cases exercise. */
interface UploadsClient {
  put(key: string, bytes: Uint8Array, options?: { readonly contentType?: string }): Promise<void>;
  createWriteUrl(
    key: string,
    options?: { readonly contentType?: string; readonly contentLength?: number },
  ): Promise<string>;
}

/** A provider that accepts anything and records each operation it receives.
 * @returns The provider and the names of the operations it was called with.
 */
function recordingProvider() {
  const calls: string[] = [];
  const provider = {
    capabilities: { signedWriteUrl: true },
    put: async () => void calls.push("put"),
    createWriteUrl: async (key: string) => {
      calls.push("createWriteUrl");
      return `https://storage.example.test/${key}`;
    },
  };
  return { provider, calls };
}

/** Builds the `uploads` client the way an invocation context does.
 * @param declaration - What the function declared under `buckets.uploads`.
 * @param source - The bucket's source, keyed by the bucket's graph identity.
 * @returns The guarded bucket client.
 */
function uploadsClient(declaration: DependencyRefLike, source: object): UploadsClient {
  const clients = dependencies.buildDependencyClients({
    ownerId: "media.upload",
    dependencies: { buckets: { uploads: declaration } },
    sources: { buckets: { [BUCKET_ID]: source } },
  });
  return clients.buckets.uploads as UploadsClient;
}

/** Asserts the declared limits hold and that only the allowed upload reaches the provider.
 * @param client - Bucket client under test.
 * @param calls - Operations the provider received.
 * @returns Completion after every case ran.
 */
async function expectLimitsEnforced(client: UploadsClient, calls: readonly string[]) {
  const refused = { code: "RELKIT_BUCKET_POLICY_INVALID" };
  await expect(
    client.createWriteUrl("a.pdf", { contentType: "application/pdf", contentLength: 10 }),
  ).rejects.toMatchObject(refused);
  await expect(
    client.createWriteUrl("a.png", { contentType: "image/png", contentLength: 2000 }),
  ).rejects.toMatchObject(refused);
  await expect(
    client.put("a.png", new Uint8Array(2000), { contentType: "image/png" }),
  ).rejects.toMatchObject(refused);
  expect(calls).toEqual([]);
  await expect(
    client.createWriteUrl("a.png", { contentType: "image/png", contentLength: 10 }),
  ).resolves.toBe("https://storage.example.test/a.png");
  await client.put("a.png", new Uint8Array(10), { contentType: "image/png" });
  expect(calls).toEqual(["createWriteUrl", "put"]);
}

/** Asserts a bucket without limits signs and stores whatever it is given, as before.
 * @param client - Bucket client under test.
 * @param calls - Operations the provider received.
 * @returns Completion after every case ran.
 */
async function expectNoLimits(client: UploadsClient, calls: readonly string[]) {
  await client.createWriteUrl("a.pdf", { contentType: "application/pdf", contentLength: 10 });
  await client.put("a.pdf", new Uint8Array(2000), { contentType: "application/pdf" });
  expect(calls).toEqual(["createWriteUrl", "put"]);
}

describe("declared bucket limits on engine-built clients", () => {
  test("an authored descriptor's limits are enforced before the provider", async () => {
    const { provider, calls } = recordingProvider();
    const bucket = defineBucket({ id: BUCKET_ID, visibility: "private", ...LIMITS });
    await expectLimitsEnforced(uploadsClient(bucket, provider), calls);
  });

  test("graph limits bound to the source reach a bare reference", async () => {
    const { provider, calls } = recordingProvider();
    const node = { kind: "bucket", id: BUCKET_ID, profile: "default", ...LIMITS };
    const source = dependencies.bindBucketPolicy(provider, node);
    await expectLimitsEnforced(
      uploadsClient({ ref: { kind: "bucket", id: BUCKET_ID } }, source),
      calls,
    );
  });

  test("buckets without limits behave as before on both paths", async () => {
    const authored = recordingProvider();
    const bucket = defineBucket({ id: BUCKET_ID, visibility: "private" });
    await expectNoLimits(uploadsClient(bucket, authored.provider), authored.calls);

    const bound = recordingProvider();
    const node = { kind: "bucket", id: BUCKET_ID, profile: "default" };
    expect(dependencies.bindBucketPolicy(bound.provider, node)).toBe(bound.provider);
    const reference = { ref: { kind: "bucket", id: BUCKET_ID } };
    await expectNoLimits(uploadsClient(reference, bound.provider), bound.calls);
  });
});
