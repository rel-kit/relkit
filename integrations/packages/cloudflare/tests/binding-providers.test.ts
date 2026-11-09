/**
 * The Workers binding providers run the published `@relkit/testing` cache and bucket suites against
 * in-memory stand-ins for a KV namespace and an R2 bucket, read their binding from the Worker's
 * `env` when none is passed, and the authoring helpers record the binding name in the adapter's
 * behavior. The same suites run inside workerd against wrangler's local bindings in
 * `workers-conformance.test.ts`.
 */
import { afterEach, expect, test } from "bun:test";
import { kvBinding, r2Binding } from "../src/bindings.ts";
import {
  createCloudflareKvBindingCacheProvider,
  createCloudflareR2BindingBucketProvider,
  type KvNamespaceBinding,
  type R2BucketBinding,
} from "../src/runtime/binding-providers.ts";
import { createBucketsConformanceHarness } from "@relkit/testing/buckets-conformance";
import { createCacheConformanceHarness } from "@relkit/testing/cache-conformance";
import { runConformance, type ConformanceReport } from "@relkit/testing/conformance";

const BINDINGS = Symbol.for("relkit.workers.bindings");
afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[BINDINGS];
});

/** @returns An in-memory KV namespace. */
function memoryKv(): KvNamespaceBinding & { readonly ttls: Map<string, number | undefined> } {
  const values = new Map<string, string>();
  const ttls = new Map<string, number | undefined>();
  return {
    ttls,
    get: async (key) => values.get(key) ?? null,
    put: async (key, value, options) => {
      values.set(key, value);
      ttls.set(key, options?.expirationTtl);
    },
    delete: async (key) => {
      values.delete(key);
    },
  };
}

/** @returns An in-memory R2 bucket with one-key pages, to exercise list cursors. */
function memoryR2(): R2BucketBinding {
  const objects = new Map<
    string,
    { bytes: Uint8Array; contentType?: string; metadata?: Readonly<Record<string, string>> }
  >();
  const head = (key: string) => {
    const object = objects.get(key);
    if (object === undefined) return null;
    return {
      key,
      etag: `"etag-${key}-${object.bytes.reduce((sum, byte) => sum + byte, object.bytes.length)}"`,
      size: object.bytes.byteLength,
      ...(object.contentType === undefined
        ? {}
        : { httpMetadata: { contentType: object.contentType } }),
      ...(object.metadata === undefined ? {} : { customMetadata: object.metadata }),
    };
  };
  return {
    put: async (key, value, options) => {
      objects.set(key, {
        bytes: value,
        ...(options?.httpMetadata?.contentType === undefined
          ? {}
          : { contentType: options.httpMetadata.contentType }),
        ...(options?.customMetadata === undefined ? {} : { metadata: options.customMetadata }),
      });
    },
    get: async (key) => {
      const found = head(key);
      const bytes = objects.get(key)?.bytes;
      return found === null || bytes === undefined
        ? null
        : { ...found, arrayBuffer: async () => bytes.slice().buffer };
    },
    head: async (key) => head(key),
    delete: async (key) => {
      objects.delete(key);
    },
    list: async (options) => {
      const keys = [...objects.keys()]
        .filter((key) => key.startsWith(options?.prefix ?? ""))
        .sort();
      const start = options?.cursor === undefined ? 0 : Number(options.cursor);
      const page = keys.slice(start, start + 1);
      const truncated = start + 1 < keys.length;
      return {
        objects: page.map((key) => head(key)!),
        truncated,
        ...(truncated ? { cursor: String(start + 1) } : {}),
      };
    },
  };
}

test("the KV binding cache passes the cache suite and rounds TTLs up to seconds", async () => {
  const namespace = memoryKv();
  const report = await runConformance(
    createCacheConformanceHarness({
      create: (cacheId) =>
        createCloudflareKvBindingCacheProvider({ binding: "CACHE", cacheId, namespace }),
      failing: () => createCloudflareKvBindingCacheProvider({ binding: "MISSING", cacheId: "c" }),
      minTtlMs: 60_000,
    }),
  );
  expect(failures(report)).toEqual([]);
  expect(skipped(report)).toEqual(["increment"]);
  expect([...namespace.ttls.values()]).toContain(60);
});

test("the R2 binding bucket passes the bucket suite across list pages", async () => {
  const bucket = memoryR2();
  const report = await runConformance(
    createBucketsConformanceHarness({
      create: () => createCloudflareR2BindingBucketProvider({ binding: "UPLOADS", bucket }),
      failing: () => createCloudflareR2BindingBucketProvider({ binding: "MISSING" }),
    }),
  );
  expect(failures(report)).toEqual([]);
  expect(skipped(report)).toEqual(["signed-urls", "closed"]);
});

/** @param report - Conformance report. @returns The failed cases. */
function failures(report: ConformanceReport) {
  return report.results.filter((result) => result.outcome === "fail");
}

/** @param report - Conformance report. @returns Ids of the skipped cases. */
function skipped(report: ConformanceReport): readonly string[] {
  return report.results.filter((result) => result.outcome === "skip").map((result) => result.id);
}

test("providers read their binding from the Worker's env and name a missing one", async () => {
  const namespace = memoryKv();
  (globalThis as Record<symbol, unknown>)[BINDINGS] = { CACHE: namespace };
  const cache = createCloudflareKvBindingCacheProvider({ binding: "CACHE", cacheId: "c" });
  await cache.set("key", 1);
  expect(await namespace.get('c:"key"', "text")).toBe("1");
  const missing = createCloudflareKvBindingCacheProvider({ binding: "OTHER", cacheId: "c" });
  await expect(missing.get("key")).rejects.toThrow("The Worker has no binding named OTHER");
  delete (globalThis as Record<symbol, unknown>)[BINDINGS];
  await expect(cache.get("key")).rejects.toThrow("only available inside a Worker");
});

test("authoring records the binding and validates its name", () => {
  expect(kvBinding({ binding: "CACHE" }).behavior.value).toEqual({
    binding: "CACHE",
    minimumTtlMs: 60_000,
  });
  expect(kvBinding({ binding: "CACHE" }).adapterId).toBe("cloudflare-kv-binding");
  expect(r2Binding({ binding: "UPLOADS" }).behavior.value).toEqual({ binding: "UPLOADS" });
  expect(r2Binding({ binding: "UPLOADS" }).features).toEqual([]);
  expect(() => kvBinding({ binding: "cache" })).toThrow("must name a binding in upper case");
  expect(() => r2Binding({ binding: "UPLOADS", region: "eu" } as never)).toThrow(
    'Unknown Cloudflare R2 binding option "region"',
  );
});
