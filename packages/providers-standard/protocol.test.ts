import { describe, expect, test } from "bun:test";
import { external, s3 } from "@zsys/app";
import type { CacheOperationContext } from "@zsys/cache";
import { createRedisCacheProvider } from "./src/redis.ts";
import type { StandardRedisClient } from "./src/redis-client.ts";
import { createS3BucketProvider } from "./src/s3.ts";
import { standardProviderFactories } from "./src/factories.ts";

const credentials = {
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
};

describe("S3-compatible provider", () => {
  test("allows optional credentials to resolve to no credentials", async () => {
    const factory = standardProviderFactories["buckets:s3"]!;
    const binding = external(
      s3({
        endpoint: new URL("http://127.0.0.1:9000"),
        bucketName: "assets",
        region: "us-east-1",
      }),
    );
    const generation = await factory.create({
      generationId: "provider-standard-test",
      environment: "development",
      capability: "buckets",
      profile: "default",
      binding,
      configuration: {
        endpoint: new URL("http://127.0.0.1:9000"),
        bucketName: "assets",
        region: "us-east-1",
        credentials: { accessKeyId: undefined, secretAccessKey: undefined },
      },
    });

    expect(generation.value).toBeDefined();
  });

  for (const variant of [
    { name: "AWS-style", endpoint: "https://s3.us-east-1.amazonaws.com", path: false },
    { name: "R2-style", endpoint: "https://account.r2.cloudflarestorage.com", path: true },
    { name: "MinIO-style", endpoint: "http://127.0.0.1:9000", path: true },
  ]) {
    test(`${variant.name} endpoint signs requests and preserves its addressing mode`, async () => {
      const requests: { url: string; init?: RequestInit }[] = [];
      const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.includes("list-type=2")) {
          return new Response(
            "<ListBucketResult><Contents><Key>a.txt</Key></Contents></ListBucketResult>",
          );
        }
        if (init?.method === "HEAD") {
          return new Response(null, {
            headers: {
              etag: '"etag"',
              "content-length": "3",
              "content-type": "text/plain",
              "x-amz-meta-owner": "zsys",
            },
          });
        }
        return new Response(init?.method === "GET" ? "abc" : null);
      };
      const provider = createS3BucketProvider({
        endpoint: variant.endpoint,
        bucketName: "assets",
        region: variant.name === "R2-style" ? "auto" : "us-east-1",
        credentials,
        forcePathStyle: variant.path,
        fetch: fetcher as typeof fetch,
      });

      await provider.put!("folder/a.txt", new TextEncoder().encode("abc"), {
        contentType: "text/plain",
        metadata: { owner: "zsys" },
      });
      expect(new TextDecoder().decode(await provider.get!("folder/a.txt"))).toBe("abc");
      expect(await provider.head!("folder/a.txt")).toMatchObject({
        etag: "etag",
        size: 3,
        contentType: "text/plain",
        metadata: { owner: "zsys" },
      });
      expect(await provider.list!("folder")).toEqual(["a.txt"]);
      expect(
        await provider.inspector.list({
          prefix: "folder",
          limit: 50,
          signal: new AbortController().signal,
        }),
      ).toMatchObject({ items: [{ key: "a.txt" }] });
      expect(
        await provider.inspector.preview({
          key: "folder/a.txt",
          offset: 0,
          limit: 2,
          signal: new AbortController().signal,
        }),
      ).toMatchObject({ bytes: new Uint8Array([97, 98, 99]), totalBytes: 3 });
      const write = requests[0]!;
      expect(new Headers(write.init?.headers).get("authorization")).toStartWith("AWS4-HMAC-SHA256");
      expect(write.url).toContain(variant.path ? "/assets/folder/a.txt" : "assets.");
      expect(await provider.createReadUrl!("folder/a.txt")).toContain("X-Amz-Signature=");
      expect(await provider.createWriteUrl!("folder/a.txt")).toContain("X-Amz-Signature=");
    });
  }

  test("propagates cancellation to fetch", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const provider = createS3BucketProvider({
      endpoint: "http://127.0.0.1:9000",
      bucketName: "assets",
      region: "us-east-1",
      credentials,
      forcePathStyle: true,
      fetch: (async (_input, init) => {
        expect(init?.signal?.aborted).toBe(true);
        throw init?.signal?.reason;
      }) as typeof fetch,
    });
    await expect(
      provider.get!("cancelled", { operation: "get", signal: controller.signal }),
    ).rejects.toThrow("cancelled");
  });

  test("includes the S3 response code and message in provider errors", async () => {
    const provider = createS3BucketProvider({
      endpoint: "https://project.storage.supabase.co/storage/v1/s3",
      bucketName: "assets",
      region: "eu-central-1",
      credentials,
      forcePathStyle: true,
      fetch: (async () =>
        new Response(
          "<Error><Code>InvalidAccessKeyId</Code><Message>Access key not found</Message></Error>",
          { status: 403 },
        )) as typeof fetch,
    });

    await expect(provider.list!()).rejects.toThrow(
      "S3 list failed with status 403: InvalidAccessKeyId: Access key not found",
    );
  });
});

describe("Redis-compatible provider", () => {
  test("supports JSON, TTL, deletion, and numeric increment", async () => {
    const client = memoryRedisClient();
    const provider = createRedisCacheProvider({
      url: "rediss://example.upstash.io",
      cacheId: "default",
      client,
    });
    const context = operationContext();

    await provider.ready();
    await provider.set!("json", { ok: true }, { ttlMs: 500 }, context);
    expect(await provider.get!("json", context)).toEqual({ ok: true });
    expect(await provider.has!("json", context)).toBe(true);
    expect(await provider.increment!("count", 2, { ttlMs: 500 }, context)).toBe(2);
    expect(await provider.increment!("count", 3, undefined, context)).toBe(5);
    expect(
      await provider.inspector.scan({ search: "json", limit: 50, signal: context.signal }),
    ).toMatchObject({ items: [{ key: '"json"', type: "string" }] });
    expect(
      await provider.inspector.value({ key: '"json"', limit: 1_000, signal: context.signal }),
    ).toMatchObject({ value: { ok: true }, truncated: false });
    await provider.delete!("json", context);
    expect(await provider.get!("json", context)).toBeUndefined();
    await provider.close();
  });
});

function operationContext(): CacheOperationContext {
  return { operation: "get", signal: new AbortController().signal };
}

function memoryRedisClient(): StandardRedisClient {
  const values = new Map<string, string>();
  let connected = false;
  return {
    get connected() {
      return connected;
    },
    connect: async () => {
      connected = true;
    },
    close: () => {
      connected = false;
    },
    ping: async () => true,
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value);
    },
    delete: async (key) => (values.delete(key) ? 1 : 0),
    has: async (key) => values.has(key),
    increment: async (key, amount = 1) => {
      const value = Number(values.get(key) ?? "0") + amount;
      values.set(key, String(value));
      return value;
    },
    scan: async (cursor, pattern, count) => {
      const first = pattern.indexOf("*");
      const last = pattern.lastIndexOf("*");
      const prefix = first < 0 ? pattern : pattern.slice(0, first);
      const search = first < 0 ? "" : pattern.slice(first + 1, last).replace(/\\(.)/g, "$1");
      const keys = [...values.keys()]
        .filter((key) => key.startsWith(prefix) && key.includes(search))
        .slice(0, count);
      return [cursor === "0" ? "0" : cursor, keys];
    },
    type: async (key) => (values.has(key) ? "string" : "none"),
    ttl: async (key) => (values.has(key) ? -1 : -2),
  };
}
