import { describe, expect, test } from "bun:test";
import { createCacheClient, type CacheProvider } from "../../packages/cache/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";

export interface CacheFailureControls {
  readonly once: (point: string, cause?: unknown) => void;
}

export interface CacheContractOptions {
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
  readonly maxEntries?: number;
  readonly maxBytes?: number;
  readonly onSnapshot?: (snapshot: unknown) => void;
}

export interface CacheContractHarness {
  readonly provider: CacheProvider;
  readonly close: () => Promise<void>;
  readonly advance: (milliseconds: number) => Promise<void>;
  readonly safeView: () => unknown;
  readonly failures?: CacheFailureControls;
}

export interface CacheContractTarget {
  readonly name: string;
  readonly features: {
    readonly eviction: boolean;
    readonly failureInjection: boolean;
  };
  readonly create: (options?: CacheContractOptions) => Promise<CacheContractHarness>;
}

const keySchema = z.object({ sku: z.string(), region: z.string() });
const valueSchema = z.number().int();

export function registerCacheContractSuite(target: CacheContractTarget): void {
  describe.serial(`cache contract: ${target.name}`, () => {
    test("covers get, set, delete, has, getOrSet, and increment", async () => {
      await withCache(target, async ({ client }) => {
        const key = { sku: "sku-1", region: "eu" };
        await client.set(key, 2);
        expect(await client.get(key)).toBe(2);
        expect(await client.has(key)).toBe(true);
        let produced = 0;
        expect(
          await client.getOrSet(key, async () => {
            produced += 1;
            return 3;
          }),
        ).toBe(2);
        expect(produced).toBe(0);

        await client.delete(key);
        expect(await client.has(key)).toBe(false);
        expect(
          await client.getOrSet(key, async () => {
            produced += 1;
            return 3;
          }),
        ).toBe(3);
        expect(await client.increment(key, 2)).toBe(5);
        expect(await client.get(key)).toBe(5);
      });
    });

    test("uses canonical object keys and deterministic TTL expiry", async () => {
      await withCache(
        target,
        async ({ client, advance }) => {
          const first = { sku: "sku-2", region: "eu" };
          const equivalent = { region: "eu", sku: "sku-2" };
          await client.set(first, 7, { ttlMs: 10 });
          expect(await client.get(equivalent)).toBe(7);
          await advance(9);
          expect(await client.get(first)).toBe(7);
          await advance(1);
          expect(await client.get(first)).toBeUndefined();
          expect(await client.has(first)).toBe(false);
        },
        { defaultTtlMs: 10, maxTtlMs: 20 },
      );
    });

    test("rejects invalid keys, values, and TTLs without replacing a value", async () => {
      await withCache(
        target,
        async ({ client }) => {
          const key = { sku: "sku-3", region: "eu" };
          await client.set(key, 11);
          await expect(client.set({ sku: "bad" } as never, 12)).rejects.toMatchObject({
            code: "ZSYS_CACHE_SCHEMA_VALIDATION",
            phase: "key",
          });
          await expect(client.set(key, "bad" as never)).rejects.toMatchObject({
            code: "ZSYS_CACHE_SCHEMA_VALIDATION",
            phase: "value",
          });
          await expect(client.set(key, 12, { ttlMs: 21 })).rejects.toMatchObject({
            code: "ZSYS_CACHE_TTL_POLICY",
          });
          expect(await client.get(key)).toBe(11);
        },
        { maxTtlMs: 20 },
      );
    });

    test("runs one producer per key for concurrent misses", async () => {
      await withCache(target, async ({ client }) => {
        let calls = 0;
        let started!: () => void;
        const producerStarted = new Promise<void>((resolve) => {
          started = resolve;
        });
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const produce = async () => {
          calls += 1;
          started();
          await gate;
          return 13;
        };
        const first = client.getOrSet({ sku: "flight", region: "eu" }, produce);
        const second = client.getOrSet({ sku: "flight", region: "eu" }, produce);
        await producerStarted;
        expect(calls).toBe(1);
        release();
        expect(await Promise.all([first, second])).toEqual([13, 13]);
      });
    });

    test("keeps cache observations free of raw keys and values", async () => {
      await withCache(target, async ({ client, safeView }) => {
        await client.set({ sku: "synthetic-cache-key", region: "secret" }, 17);
        const serialized = JSON.stringify(safeView());
        expect(serialized).not.toContain("synthetic-cache-key");
        expect(serialized).not.toContain("secret");
        expect(serialized).not.toContain("17");
      });
    });

    test("rejects an unavailable increment capability explicitly", async () => {
      await withCache(target, async ({ provider, close }) => {
        let called = false;
        const unsupported = createCacheClient({
          ownerId: "contracts.cache",
          cacheId: "unsupported",
          source: {
            ...provider,
            capabilities: { increment: false },
            increment: async () => {
              called = true;
              return 1;
            },
          },
          keySchema: z.string(),
          valueSchema: z.number(),
        });
        await expect(
          (unsupported as unknown as { increment: (key: string) => Promise<number> }).increment(
            "key",
          ),
        ).rejects.toMatchObject({
          code: "ZSYS_CACHE_CAPABILITY_UNSUPPORTED",
          capability: "increment",
        });
        expect(called).toBe(false);

        const text = createCacheClient({
          ownerId: "contracts.cache",
          cacheId: "text",
          source: provider,
          keySchema: z.string(),
          valueSchema: z.string(),
        });
        await expect(
          (text as unknown as { increment: (key: string) => Promise<unknown> }).increment("key"),
        ).rejects.toMatchObject({ code: "ZSYS_CACHE_INCREMENT_UNSUPPORTED" });
        await close();
      });
    });

    test("rejects reads after the provider goes out of service", async () => {
      await withCache(target, async ({ client, close }) => {
        await client.set({ sku: "outage", region: "eu" }, 1);
        await close();
        await expect(client.get({ sku: "outage", region: "eu" })).rejects.toThrow();
      });
    });

    if (target.features.failureInjection) {
      test("preserves the prior entry when a write outage is injected", async () => {
        await withCache(target, async ({ client, failures }) => {
          expect(failures).toBeDefined();
          const key = { sku: "failure", region: "eu" };
          await client.set(key, 1);
          failures!.once("cache.before-set");
          await expect(client.set(key, 2)).rejects.toThrow();
          expect(await client.get(key)).toBe(1);
        });
      });
    }

    if (target.features.eviction) {
      test("evicts the least recently used entry within the configured bound", async () => {
        await withCache(
          target,
          async ({ client, safeView }) => {
            const a = { sku: "a", region: "eu" };
            const b = { sku: "b", region: "eu" };
            const c = { sku: "c", region: "eu" };
            await client.set(a, 1);
            await client.set(b, 2);
            expect(await client.get(a)).toBe(1);
            await client.set(c, 3);
            expect(await client.get(a)).toBe(1);
            expect(await client.get(b)).toBeUndefined();
            expect(await client.get(c)).toBe(3);
            expect((safeView() as { evictions?: number }).evictions).toBe(1);
          },
          { maxEntries: 2 },
        );
      });
    }
  });
}

async function withCache(
  target: CacheContractTarget,
  run: (
    value: CacheContractHarness & {
      readonly client: ReturnType<typeof createCacheClient>;
    },
  ) => Promise<void>,
  options?: CacheContractOptions,
): Promise<void> {
  const harness = await target.create(options);
  const client = createCacheClient({
    ownerId: "contracts.cache",
    cacheId: "contract",
    source: harness.provider,
    keySchema,
    valueSchema,
    ...(options?.defaultTtlMs === undefined ? {} : { defaultTtlMs: options.defaultTtlMs }),
    ...(options?.maxTtlMs === undefined ? {} : { maxTtlMs: options.maxTtlMs }),
  });
  try {
    await run({ ...harness, client });
  } finally {
    await harness.close();
  }
}
