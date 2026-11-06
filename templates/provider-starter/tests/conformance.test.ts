/**
 * Runs the shared cache conformance suite against the starter provider: the same cases every
 * first-party cache provider passes, one test per case. Failure injection uses a store whose
 * backend is down.
 */
import { describe, expect, test } from "bun:test";
import { createCacheConformanceHarness } from "@relkit/testing/cache-conformance";
import { runConformance } from "@relkit/testing/conformance";
import { createStarterCacheProvider, runtimeIntegration } from "../src/runtime.js";
import { starterCache } from "../src/index.js";

const down = async (): Promise<never> => {
  throw new Error("backend unavailable");
};
const harness = createCacheConformanceHarness({
  create: (cacheId) => createStarterCacheProvider({ cacheId }),
  failing: () =>
    createStarterCacheProvider({ cacheId: "down", store: { get: down, set: down, delete: down } }),
});

describe("starter cache conformance", () => {
  for (const item of harness.cases) test(item.description, () => harness.run(item.id));
  test("every case passes", async () => {
    const report = await runConformance(harness);
    expect(report.results.map((result) => result.outcome)).toEqual(harness.cases.map(() => "pass"));
  });
});

test("the descriptor and the runtime registration name the same adapter", () => {
  const descriptor = starterCache({ maxEntries: 10 });
  const registration = runtimeIntegration.registrations[0]!;
  expect(descriptor.adapterId).toBe(registration.adapterId);
  expect(descriptor.integration.integrationId).toBe(runtimeIntegration.integrationId);
  expect(() => starterCache({ maxEntries: 0 })).toThrow("positive integer");
});
