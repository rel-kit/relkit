import { strict as assert } from "node:assert";
import type { RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import { watchJobRun } from "@relkit/client/jobs";
import { measure } from "./performance-support.js";
import type { WatchMeasurement, WatchResourceCounts } from "./performance-core-consumers.types.js";

/**
 * Measures the existing 100-feed/1,000-lease envelope through final native release.
 * @param signal - Deadline shared by the complete performance replay.
 * @returns Latency distribution and resource totals including ten warm-up batches.
 */
export async function measureSharedWatch(signal: AbortSignal): Promise<WatchMeasurement> {
  const resources: WatchResourceCounts = {
    opened: 0,
    returned: 0,
    active: 0,
    peakActive: 0,
    connectedLeases: 0,
    disposedLeases: 0,
  };
  const latency = await measure(25, async () => {
    signal.throwIfAborted();
    const openedBefore = resources.opened;
    const returnedBefore = resources.returned;
    const client = {
      jobs: {
        performance: {
          runs: {
            watch: async (input: { readonly runId: string }) =>
              holdingWatch(input.runId, resources),
          },
        },
      },
    };
    const controllers = Array.from({ length: 1_000 }, (_, index) =>
      watchJobRun(client, "performance", {
        runId: `run-${Math.floor(index / 10)}`,
        readTimeoutMs: 1_000,
      }),
    );
    // Deadline cancellation releases every observer without stopping caller-owned work.
    const dispose = async (): Promise<void> => {
      await Promise.all(controllers.map((controller) => controller.dispose()));
    };
    const onAbort = (): void => {
      void dispose().catch(() => undefined);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      await Promise.all(controllers.map((controller) => controller.connect()));
      resources.connectedLeases += controllers.length;
      assert.equal(resources.opened - openedBefore, 100, "same-key leases must share feeds");
      assert.equal(resources.active, 100, "all native feeds must remain active before release");
      await Promise.all(controllers.slice(0, 500).map((controller) => controller.dispose()));
      assert.equal(resources.active, 50, "releasing half the run groups must retain the rest");
    } finally {
      await dispose();
      resources.disposedLeases += controllers.length;
      signal.removeEventListener("abort", onAbort);
    }
    signal.throwIfAborted();
    assert.equal(resources.active, 0, "all feeds must close after their final borrower");
    assert.equal(
      resources.returned - returnedBefore,
      100,
      "native release must occur exactly once",
    );
  });
  assert.equal(resources.opened, resources.returned);
  assert.equal(resources.connectedLeases, resources.disposedLeases);
  return { latency, resources, feedsPerBatch: 100, leasesPerBatch: 1_000 };
}

/**
 * Reuses the holding-iterator semantics from the existing shared-watch load test.
 * @param runId - Run identity shared by ten controller leases.
 * @param resources - Mutable replay counters owned by this benchmark.
 * @returns One snapshot followed by a pending pull released by iterator return.
 */
function holdingWatch(runId: string, resources: WatchResourceCounts): AsyncIterator<RunWatchFrame> {
  resources.opened += 1;
  resources.active += 1;
  resources.peakActive = Math.max(resources.peakActive, resources.active);
  const pending = Promise.withResolvers<IteratorResult<RunWatchFrame>>();
  let emitted = false;
  let closed = false;
  const run: RunSnapshot = {
    accepted: true,
    runId,
    jobId: "performance",
    taskId: "performance",
    taskVersion: "1",
    acceptedAt: "2026-01-01T00:00:00.000Z",
    observedAt: "2026-01-01T00:00:00.000Z",
    buildId: "performance",
    service: "performance",
    status: "running",
    resultAvailability: "pending",
  };
  return {
    next: async () => {
      if (closed) return { done: true, value: undefined };
      if (emitted) return pending.promise;
      emitted = true;
      return {
        done: false,
        value: {
          kind: "snapshot",
          run,
          epoch: "performance",
          sequence: 0,
          cursor: `cursor-${runId}`,
          observedAt: run.observedAt,
          continuity: "state",
        },
      };
    },
    return: async () => {
      if (!closed) {
        closed = true;
        resources.returned += 1;
        resources.active -= 1;
        pending.resolve({ done: true, value: undefined });
      }
      return { done: true, value: undefined };
    },
  };
}
