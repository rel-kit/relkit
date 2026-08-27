import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestRuntime } from "../../packages/testing/src/index.ts";
import {
  createLocalBucketProviderForTest,
  type LocalBucketProvider,
} from "../../packages/providers-local/src/index.ts";
import { registerBucketContractSuite, type BucketContractTarget } from "./buckets.ts";

const localBuckets: BucketContractTarget = {
  name: "local provider",
  features: { atomicFailureInjection: false, pagination: true },
  create: async (options = {}) => {
    const root = await mkdtemp(join(tmpdir(), "relkit-contract-bucket-"));
    const provider = createLocalBucketProviderForTest({ ...options, root });
    return localHarness(provider, () => rm(root, { recursive: true, force: true }));
  },
};

const testBuckets: BucketContractTarget = {
  name: "test fake",
  features: { atomicFailureInjection: true, pagination: false },
  create: async (options = {}) => {
    const runtime = createTestRuntime({ startTimeMs: 0 });
    const fake = runtime.fakes.createBucket("contract", options);
    return {
      provider: fake.provider,
      capabilities: fake.capabilities,
      failures: runtime.fakes.failures,
      close: async () => {
        await fake.close();
        await runtime.close();
      },
    };
  },
};

registerBucketContractSuite(localBuckets);
registerBucketContractSuite(testBuckets);

function localHarness(
  provider: LocalBucketProvider,
  cleanup: () => Promise<void>,
): Awaited<ReturnType<BucketContractTarget["create"]>> {
  return Promise.resolve({
    provider,
    capabilities: provider.capabilities,
    listPage: provider.listPage,
    close: async () => {
      await provider.close();
      await cleanup();
    },
  });
}
