/**
 * Shared cache provider conformance suite. Every first-party cache provider (local, Redis, Redis
 * over HTTP, Cloudflare KV) runs these cases, and provider authors run the same ones.
 */
import type { CacheOperation, CacheOperationContext } from "relkit/cache";
import type {
  CacheConformanceCase,
  CacheConformanceCaseId,
  CacheConformanceOptions,
  CacheConformanceProvider,
} from "./cache-conformance.types.js";
import type { ConformanceHarness } from "./conformance.types.js";
import {
  abortedSignal,
  check,
  conformanceHarness,
  delay,
  rejects,
  same,
  SKIPPED,
} from "./conformance.js";

export type * from "./cache-conformance.types.js";

/** The cases every cache provider passes. */
export const CACHE_CONFORMANCE_CASES: readonly CacheConformanceCase[] = Object.freeze([
  { id: "round-trip", description: "values round-trip under canonical keys" },
  { id: "has-delete", description: "has reports presence and delete removes the entry" },
  { id: "get-or-set", description: "getOrSet produces a missing value once" },
  { id: "increment", description: "increment counts from zero when the provider supports it" },
  { id: "ttl", description: "entries expire after their TTL and the TTL floor is enforced" },
  { id: "cancellation", description: "an aborted operation rejects" },
  { id: "closed", description: "operations reject after close" },
  { id: "backend-failure", description: "a failing backend rejects instead of reporting a miss" },
]);

/**
 * Creates the cache conformance harness for one provider.
 * @param options - Provider factory, optional failing provider and TTL floor.
 * @returns Cases and a runner; pass it to `runConformance` or run each case as a test.
 * @example
 * ```ts
 * import { runConformance } from "@relkit/testing/conformance";
 * import { createCacheConformanceHarness } from "@relkit/testing/cache-conformance";
 * import { createLocalCacheProvider } from "relkit/providers-local";
 *
 * const harness = createCacheConformanceHarness({
 *   create: (cacheId) => createLocalCacheProvider({ cacheId }),
 * });
 * const report = await runConformance(harness);
 * console.log(report.passed);
 * ```
 */
export function createCacheConformanceHarness(
  options: CacheConformanceOptions,
): ConformanceHarness<CacheConformanceCaseId> {
  const prefix = `conformance-${Math.random().toString(36).slice(2, 10)}`;
  const withProvider =
    (caseId: string, body: (provider: Required<CacheConformanceProvider>) => Promise<unknown>) =>
    async (): Promise<void | "skipped"> => {
      const provider = options.create(`${prefix}-${caseId}`);
      await provider.ready?.();
      try {
        const result = await body(complete(provider));
        if (result === SKIPPED) return SKIPPED;
      } finally {
        await provider.close?.();
      }
    };
  return conformanceHarness("cache", CACHE_CONFORMANCE_CASES, {
    "round-trip": withProvider("round-trip", async (cache) => {
      check((await cache.get("missing")) === undefined, "a missing key reads as undefined");
      await cache.set({ sku: "sku-1", region: "eu" }, { nested: [1, 2], ok: true });
      const read = await cache.get({ region: "eu", sku: "sku-1" });
      check(same(read, { nested: [1, 2], ok: true }), "key order does not change the key", read);
      await cache.set("text", "value");
      check((await cache.get("text")) === "value", "string values round-trip");
      await cache.set("text", "replaced");
      check((await cache.get("text")) === "replaced", "set replaces an existing value");
    }),
    "has-delete": withProvider("has-delete", async (cache) => {
      await cache.set("present", 1);
      check((await cache.has("present")) === true, "has is true after set");
      await cache.delete("present");
      check((await cache.has("present")) === false, "has is false after delete");
      check((await cache.get("present")) === undefined, "get is undefined after delete");
      await cache.delete("never-set");
    }),
    "get-or-set": withProvider("get-or-set", async (cache) => {
      let produced = 0;
      const produce = () => {
        produced += 1;
        return "fresh";
      };
      const settings = ttlSettings(options);
      check((await cache.getOrSet("memo", produce, settings)) === "fresh", "first call produces");
      check((await cache.getOrSet("memo", produce, settings)) === "fresh", "second call reads");
      check(produced === 1, "the producer runs once", produced);
    }),
    increment: withProvider("increment", async (cache) => {
      if (!supportsIncrement(cache)) return SKIPPED;
      check((await cache.increment("counter", 5)) === 5, "increment starts from zero");
      check((await cache.increment("counter", 1)) === 6, "increment adds the delta");
      check(same(await cache.get("counter"), 6), "get reads the counter");
    }),
    ttl: withProvider("ttl", async (cache) => {
      const floor = options.minTtlMs ?? 0;
      if (floor > 0) {
        await rejects(() => cache.set("short", 1, { ttlMs: floor - 1 }), "a TTL under the floor");
        return;
      }
      await cache.set("expiring", { value: 1 }, { ttlMs: 50 });
      check(same(await cache.get("expiring"), { value: 1 }), "a TTL entry reads before expiry");
      await delay(150);
      check((await cache.get("expiring")) === undefined, "a TTL entry is gone after expiry");
    }),
    cancellation: withProvider("cancellation", async (cache) => {
      await rejects(() => cache.get("key", aborted("get")), "get with an aborted signal");
      await rejects(() => cache.set("key", 1, undefined, aborted("set")), "aborted set");
    }),
    closed: async () => {
      const provider = options.create(`${prefix}-closed`);
      await provider.ready?.();
      if (provider.close === undefined) return SKIPPED;
      await provider.close();
      await rejects(async () => provider.get?.("key"), "get after close");
      await rejects(async () => provider.set?.("key", 1), "set after close");
    },
    "backend-failure": async () => {
      if (options.failing === undefined) return SKIPPED;
      const provider = options.failing();
      try {
        await rejects(async () => provider.get?.("key"), "get on a failing backend");
        await rejects(async () => provider.set?.("key", 1), "set on a failing backend");
      } finally {
        await provider.close?.().catch(() => undefined);
      }
    },
  });
}

function ttlSettings(options: CacheConformanceOptions): { ttlMs: number } | undefined {
  return options.minTtlMs === undefined || options.minTtlMs === 0
    ? undefined
    : { ttlMs: options.minTtlMs };
}

function supportsIncrement(cache: CacheConformanceProvider): boolean {
  const capabilities = cache.capabilities;
  if (Array.isArray(capabilities)) return capabilities.includes("increment");
  const flags = capabilities as { readonly increment?: boolean } | undefined;
  return flags?.increment !== false && flags?.increment !== undefined;
}

function aborted(operation: CacheOperation): CacheOperationContext {
  return { operation, signal: abortedSignal() };
}

/** Gives every optional method a body that fails the case when the provider lacks it. */
function complete(provider: CacheConformanceProvider): Required<CacheConformanceProvider> {
  const missing = (name: string) => () => {
    throw new Error(`The provider has no ${name} method`);
  };
  const method = <K extends keyof CacheConformanceProvider>(name: K) =>
    (typeof provider[name] === "function"
      ? (provider[name] as (...args: unknown[]) => unknown).bind(provider)
      : missing(String(name))) as Required<CacheConformanceProvider>[K];
  return {
    capabilities: provider.capabilities ?? {},
    get: method("get"),
    set: method("set"),
    delete: method("delete"),
    has: method("has"),
    getOrSet: method("getOrSet"),
    increment: method("increment"),
    ready: method("ready"),
    close: method("close"),
  } as Required<CacheConformanceProvider>;
}
