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
