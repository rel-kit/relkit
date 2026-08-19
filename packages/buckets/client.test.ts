import { describe, expect, test } from "bun:test";
import {
  BucketCapabilityError,
  BucketDependencyError,
  BucketOperationCancelledError,
  BucketOperationTimeoutError,
  createBucketClient,
  type BucketOperationContext,
  type BucketProvider,
} from "./src/client.ts";

function provider(overrides: Partial<BucketProvider> = {}): BucketProvider {
  return {
    capabilities: { signedReadUrl: true, signedWriteUrl: true },
    put: async () => undefined,
    get: async () => new Uint8Array([1]),
    head: async () => ({ etag: "etag", size: 1 }),
    delete: async () => undefined,
    exists: async () => true,
    list: async () => ["asset.bin"],
    createReadUrl: async () => "https://read.example",
    createWriteUrl: async () => "https://write.example",
    ...overrides,
  };
}

describe("bucket Promise client", () => {
  test("bridges every operation and reports edges separately from operations", async () => {
    const bridgeNames: string[] = [];
    const edges: unknown[] = [];
    const operations: unknown[] = [];
    const contexts: BucketOperationContext[] = [];
    const source = provider({
      get: async (_key, context) => {
        contexts.push(context as BucketOperationContext);
        return new Uint8Array([1]);
      },
    });
    const client = createBucketClient({
      ownerId: "orders.create",
      bucketId: "assets",
      source,
      bridge: {
        run: async (operation, options) => {
          bridgeNames.push(options?.name ?? "");
          return operation();
        },
      },
      onObservedEdge: (edge) => edges.push(edge),
      onOperation: (operation) => operations.push(operation),
    });

    await client.put("asset.bin", new Uint8Array([1]));
    await client.get("asset.bin");
    await client.head("asset.bin");
    await client.delete("asset.bin");
    await client.exists("asset.bin");
    await client.list("asset");
    await client.createReadUrl("asset.bin");
    await client.createWriteUrl("asset.bin");

    expect(bridgeNames).toEqual([
      "zsys.bucket.assets.put",
      "zsys.bucket.assets.get",
      "zsys.bucket.assets.head",
      "zsys.bucket.assets.delete",
      "zsys.bucket.assets.exists",
      "zsys.bucket.assets.list",
      "zsys.bucket.assets.createReadUrl",
      "zsys.bucket.assets.createWriteUrl",
    ]);
    expect(edges).toHaveLength(8);
    expect(edges[0]).toEqual({ relationship: "uses-bucket", from: "orders.create", to: "assets" });
    expect(operations).toHaveLength(8);
    expect(
      operations.every((operation) => (operation as { outcome: string }).outcome === "success"),
    ).toBe(true);
    expect(contexts[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  test("rejects unsupported signed URLs and undeclared clients explicitly", async () => {
    let called = false;
    const unsupported = createBucketClient({
      ownerId: "orders.create",
      bucketId: "assets",
      source: provider({
        capabilities: { signedReadUrl: false },
        createReadUrl: async () => {
          called = true;
          return "never";
        },
      }),
    });
    await expect(unsupported.createReadUrl("asset.bin")).rejects.toBeInstanceOf(
      BucketCapabilityError,
    );
    expect(called).toBe(false);

    const undeclared = createBucketClient({
      ownerId: "orders.create",
      bucketId: "assets",
      source: provider(),
      declared: false,
    });
    await expect(undeclared.get("asset.bin")).rejects.toBeInstanceOf(BucketDependencyError);
  });

  test("propagates cancellation and deadline without a bridge", async () => {
    const controller = new AbortController();
    let started!: () => void;
    const pending = new Promise<void>((resolve) => {
      started = resolve;
    });
    const client = createBucketClient({
      ownerId: "orders.create",
      bucketId: "assets",
      source: provider({
        get: async (_key, context) => {
          context?.signal.addEventListener("abort", () => started(), { once: true });
          await pending;
          return undefined;
        },
      }),
      signal: () => controller.signal,
    });
    const execution = client.get("asset.bin");
    controller.abort();
    await expect(execution).rejects.toBeInstanceOf(BucketOperationCancelledError);

    const timed = createBucketClient({
      ownerId: "orders.create",
      bucketId: "assets",
      source: provider({ get: async () => undefined }),
      deadline: () => Date.now() - 1,
    });
    await expect(timed.get("asset.bin")).rejects.toBeInstanceOf(BucketOperationTimeoutError);
  });
});
