/**
 * The local event provider and the deterministic jobs adapter pass the published events and jobs
 * conformance suites, the jobs one with its unknown-outcome fault injected.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { createLocalEventProvider } from "relkit/providers-local";
import { runConformance } from "../../src/conformance.js";
import { createEventsConformanceHarness } from "../../src/events-conformance.js";
import {
  createDeterministicJobsAdapter,
  createJobsProviderConformanceHarness,
} from "../../src/jobs-conformance.js";

const root = await mkdtemp(join(tmpdir(), "relkit-durable-conformance-"));
afterAll(() => rm(root, { recursive: true, force: true }));

test("local events", async () => {
  const report = await runConformance(
    createEventsConformanceHarness({
      create: async (namespace, event) => {
        const provider = await createLocalEventProvider(join(root, namespace));
        await provider.registerContract({
          kind: "event",
          id: event.id,
          version: event.version,
          input: { type: "object" },
          source: { file: "conformance.ts", line: 1, column: 1 },
        });
        return provider;
      },
    }),
  );
  expect(report.results.filter((result) => result.outcome !== "pass")).toEqual([
    expect.objectContaining({ id: "backend-failure", outcome: "skip" }),
  ]);
}, 30_000);

test("deterministic jobs adapter", async () => {
  const report = await runConformance(
    createJobsProviderConformanceHarness({
      create: () => createDeterministicJobsAdapter(),
      faulty: () => createDeterministicJobsAdapter({ unknown: { submit: true } }),
    }),
  );
  expect(report.results.map((result) => result.outcome)).toEqual(report.results.map(() => "pass"));
});
