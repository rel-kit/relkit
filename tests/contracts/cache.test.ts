import { createTestRuntime } from "../../packages/testing/src/index.ts";
import {
  createLocalCacheProviderForTest,
  type LocalCacheProvider,
} from "../../packages/providers-local/src/index.ts";
import { registerCacheContractSuite, type CacheContractTarget } from "./cache.ts";

const localCache: CacheContractTarget = {
  name: "local provider",
  features: { eviction: true, failureInjection: false },
  create: async (options = {}) => {
    let now = 0;
    const snapshots: unknown[] = [];
    const provider = createLocalCacheProviderForTest({
      cacheId: "contract",
      schemaVersion: 1,
      clock: () => now,
      ...options,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });
    return localHarness(provider, snapshots, (milliseconds) => {
      now += milliseconds;
      return Promise.resolve();
    });
  },
};

const testCache: CacheContractTarget = {
  name: "test fake",
  features: { eviction: false, failureInjection: true },
  create: async (options = {}) => {
    const runtime = createTestRuntime({ startTimeMs: 0 });
    const fake = runtime.fakes.createCache("contract", {
      defaultTtlMs: options.defaultTtlMs,
      maxTtlMs: options.maxTtlMs,
    });
    return {
      provider: fake.provider,
      failures: runtime.fakes.failures,
      advance: runtime.clock.advance,
      safeView: fake.inspect,
      close: async () => {
        await fake.close();
        await runtime.close();
      },
    };
  },
};

registerCacheContractSuite(localCache);
registerCacheContractSuite(testCache);

function localHarness(
  provider: LocalCacheProvider,
  snapshots: readonly unknown[],
  advance: (milliseconds: number) => Promise<void>,
) {
  return Promise.resolve({
    provider,
    advance,
    safeView: () => snapshots.at(-1) ?? provider.snapshot(),
    close: () => provider.close(),
  });
}
