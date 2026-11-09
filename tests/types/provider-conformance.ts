/** Checks the published conformance suites' entry points and the shapes provider authors write. */
import type { CacheProvider } from "relkit/cache";
import {
  BUCKETS_CONFORMANCE_CASES,
  createBucketsConformanceHarness,
} from "@relkit/testing/buckets-conformance";
import {
  createCacheConformanceHarness,
  type CacheConformanceCaseId,
} from "@relkit/testing/cache-conformance";
import {
  assertConformance,
  runConformance,
  type ConformanceHarness,
  type ConformanceReport,
} from "@relkit/testing/conformance";
import { createEventsConformanceHarness } from "@relkit/testing/events-conformance";
import {
  createDeterministicJobsAdapter,
  createJobsProviderConformanceHarness,
} from "@relkit/testing/jobs-conformance";
import { createRealtimeConformanceHarness } from "@relkit/testing/realtime-conformance";
import { DEPLOY_TARGETS, type DeployTarget } from "@relkit/cli/deploy-targets";
import { createDeployTargetConformanceHarness } from "@relkit/testing/deploy-target-conformance";
import { createRuntimeConformanceHarness } from "@relkit/testing/runtime-conformance";
import type { RuntimeAdapter } from "relkit/runtime";

declare const cache: CacheProvider;
const cacheHarness: ConformanceHarness<CacheConformanceCaseId> = createCacheConformanceHarness({
  create: () => cache,
  minTtlMs: 60_000,
});
// @ts-expect-error Case ids are the suite's own.
void cacheHarness.run("not-a-case");
const report: Promise<ConformanceReport> = runConformance(cacheHarness, ["round-trip"]);
void report.then(assertConformance);
void BUCKETS_CONFORMANCE_CASES.map((item) => item.id);
createBucketsConformanceHarness({ create: () => ({ get: () => undefined }) });
createEventsConformanceHarness({
  create: () => ({ publish: () => ({ accepted: true, instanceId: "event-1" }) }),
});
createJobsProviderConformanceHarness({ create: () => createDeterministicJobsAdapter() });
// @ts-expect-error A realtime provider implements the whole provider interface.
createRealtimeConformanceHarness({ create: () => ({ getEpoch: async () => "epoch" }) });

// Runtime adapters and deploy targets have suites of the same shape.

declare const adapter: RuntimeAdapter;
createRuntimeConformanceHarness({ adapter, kind: "isolate" });
// @ts-expect-error The kind names the runtime model.
createRuntimeConformanceHarness({ adapter, kind: "browser" });
const custom: DeployTarget = {
  id: "fly",
  label: "Fly.io",
  runtimes: ["bun"],
  defaultRuntime: "bun",
  needsGraph: false,
  plan: async () => ({ files: [{ path: "fly.toml", content: "app = 'x'\n" }], nextSteps: [] }),
};
createDeployTargetConformanceHarness({ target: custom, root: "/tmp/app" });
void DEPLOY_TARGETS.map((target) => target.id);
