/**
 * The local cache, bucket and realtime providers pass the published conformance suites case by
 * case. Only cases the local backend has nothing for are skipped: no signed URLs and no backend to
 * break for failure injection.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import {
  createLocalBucketProvider,
  createLocalCacheProvider,
  createLocalRealtimeProvider,
} from "relkit/providers-local";
import { createBucketsConformanceHarness } from "../../src/buckets-conformance.js";
import { createCacheConformanceHarness } from "../../src/cache-conformance.js";
import { runConformance } from "../../src/conformance.js";
import type { ConformanceReport } from "../../src/conformance.types.js";
import { createRealtimeConformanceHarness } from "../../src/realtime-conformance.js";

const root = await mkdtemp(join(tmpdir(), "relkit-storage-conformance-"));
afterAll(() => rm(root, { recursive: true, force: true }));

describe("local storage providers", () => {
  test("cache", async () => {
    const report = await runConformance(
      createCacheConformanceHarness({ create: (cacheId) => createLocalCacheProvider({ cacheId }) }),
    );
    expectOutcomes(report, ["backend-failure"]);
  });

  test("buckets", async () => {
    const report = await runConformance(
      createBucketsConformanceHarness({
        create: () => createLocalBucketProvider({ root: join(root, "bucket") }),
      }),
    );
    expectOutcomes(report, ["signed-urls", "backend-failure"]);
  });

  test("realtime", async () => {
    const report = await runConformance(
      createRealtimeConformanceHarness({
        create: () => createLocalRealtimeProvider(join(root, "realtime"), { pollingMs: 50 }),
      }),
    );
    expectOutcomes(report, ["backend-failure"]);
  }, 30_000);
});

/**
 * Expects no failed case and exactly the listed skipped ones.
 * @param report - Conformance report. @param skipped - Expected skipped case ids.
 */
function expectOutcomes(report: ConformanceReport, skipped: readonly string[]): void {
  expect(report.results.filter((result) => result.outcome === "fail")).toEqual([]);
  const actual = report.results.filter((result) => result.outcome === "skip");
  expect(actual.map((result) => result.id)).toEqual(skipped);
}
