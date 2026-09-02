import { describe, expect, test } from "bun:test";
import { createBindingValueRef, normalizeProviderSource } from "@relkit/provider";
import { kv, r2 } from "./src/index.ts";
import {
  createCloudflareKvCacheProvider,
  createCloudflareR2BucketProvider,
} from "./src/runtime/index.ts";

const text = (name: string) => createBindingValueRef<typeof name, string, "string">(name, "string");
const secret = (name: string) =>
  createBindingValueRef<typeof name, string, "secret-string">(name, "secret-string");

describe("Cloudflare authoring", () => {
  test("declares connected KV and R2 adapters with isolated credentials", () => {
    const cache = kv({
      accountId: text("CLOUDFLARE_ACCOUNT_ID"),
      namespaceId: text("CLOUDFLARE_KV_NAMESPACE_ID"),
      apiToken: secret("CLOUDFLARE_API_TOKEN"),
    });
    const bucket = r2({
      accountId: "account",
      bucketName: "assets",
      credentials: {
        accessKeyId: secret("R2_ACCESS_KEY_ID"),
        secretAccessKey: secret("R2_SECRET_ACCESS_KEY"),
      },
      signedUrlTtlSeconds: 600,
    });

    expect(cache).toMatchObject({
      integration: { integrationId: "cloudflare" },
      capability: { id: "cache" },
      adapterId: "cloudflare-kv",
      behavior: { value: { minimumTtlMs: 60_000 } },
    });
    expect(bucket).toMatchObject({
      capability: { id: "bucket" },
      adapterId: "cloudflare-r2",
      behavior: { value: { signedUrlTtlSeconds: 600 } },
      features: [{ id: "signedReadUrl" }, { id: "signedWriteUrl" }],
    });
    expect(normalizeProviderSource(cache).source).toEqual({ kind: "connected" });
    expect(normalizeProviderSource(bucket).source).toEqual({ kind: "connected" });
  });

  test("rejects literal credentials", () => {
    const unsafeKv = kv as (options: unknown) => unknown;
    expect(() =>
      unsafeKv({ accountId: "account", namespaceId: "namespace", apiToken: "token" }),
    ).toThrow("named secret binding value");
  });
});

test("Cloudflare KV runtime sends bearer-authenticated value requests", async () => {
  const values = new Map<string, string>();
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    const marker = "/values/";
    const index = url.pathname.indexOf(marker);
    if (index < 0) return new Response("{}");
    const key = decodeURIComponent(url.pathname.slice(index + marker.length));
    if (init?.method === "PUT") {
      values.set(key, String(init.body));
      return new Response("{}");
    }
    if (init?.method === "DELETE") {
      values.delete(key);
      return new Response("{}");
    }
    const value = values.get(key);
    return value === undefined ? new Response("missing", { status: 404 }) : new Response(value);
  };
  const provider = createCloudflareKvCacheProvider({
    accountId: "account",
    namespaceId: "namespace",
    apiToken: "token",
    cacheId: "requests",
    fetch: fetcher as typeof fetch,
  });

  await provider.ready();
  await provider.set!("key", { ok: true }, { ttlMs: 60_000 });
  expect(await provider.get!("key")).toEqual({ ok: true });
  expect(await provider.has!("key")).toBe(true);
  await provider.delete!("key");
  expect(await provider.get!("key")).toBeUndefined();
  expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe("Bearer token");
  expect(requests.some(({ url }) => url.searchParams.get("expiration_ttl") === "60")).toBe(true);
  await expect(provider.set!("key", 1, { ttlMs: 1_000 })).rejects.toThrow("at least 60000");
});

test("Cloudflare R2 runtime signs S3-compatible operations", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.includes("list-type=2"))
      return new Response(
        "<ListBucketResult><Contents><Key>a.txt</Key></Contents></ListBucketResult>",
      );
    if (init?.method === "HEAD")
      return new Response(null, { headers: { etag: '"etag"', "content-length": "3" } });
    return new Response(init?.method === "GET" ? "abc" : null);
  };
  const provider = createCloudflareR2BucketProvider({
    accountId: "account",
    bucketName: "assets",
    accessKeyId: "access",
    secretAccessKey: "secret",
    fetch: fetcher as typeof fetch,
  });

  await provider.put!("folder/a.txt", new TextEncoder().encode("abc"));
  expect(new TextDecoder().decode(await provider.get!("folder/a.txt"))).toBe("abc");
  expect(await provider.list!("folder")).toEqual(["a.txt"]);
  expect(requests[0]?.url).toContain("account.r2.cloudflarestorage.com/assets/folder/a.txt");
  expect(new Headers(requests[0]?.init?.headers).get("authorization")).toStartWith(
    "AWS4-HMAC-SHA256",
  );
  expect(await provider.createReadUrl!("folder/a.txt")).toContain("X-Amz-Signature=");
});
