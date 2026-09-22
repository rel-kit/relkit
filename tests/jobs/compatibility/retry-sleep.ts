import { strict as assert } from "node:assert";
import { createCompatibilityHarness, UnknownAcceptanceError } from "./harness.ts";

export async function runRetrySleepProbe(): Promise<void> {
  const harness = createCompatibilityHarness({ now: () => 0 });
  try {
    const unknown = new UnknownAcceptanceError("op-1", "orders:1");
    harness.failures.once("submit.response", unknown);
    await assert.rejects(
      harness.native.submit({ key: "orders:1", buildId: "build-1", operationId: "op-1" }),
      (error: unknown) => error === unknown,
    );

    const recovered = await harness.native.submit({
      key: "orders:1",
      buildId: "build-1",
      operationId: "op-1",
    });
    assert.equal(recovered.duplicate, true);
    const concurrent = await Promise.all([
      harness.native.submit({ key: "orders:1", buildId: "build-2" }),
      harness.native.submit({ key: "orders:1", buildId: "build-2" }),
    ]);
    assert.equal(concurrent[0]!.runId, recovered.runId);
    assert.equal(concurrent[1]!.runId, recovered.runId);

    const eventFirst = await harness.native.routeEvent("receipt-1", "build-1");
    const eventSecond = await harness.native.routeEvent("receipt-1", "build-1");
    assert.equal(eventFirst.runId, eventSecond.runId);

    const sleep = await harness.native.submit({ key: "sleep:orders:1", buildId: "build-1" });
    harness.native.beginAttempt(sleep.runId);
    harness.native.commitWait(sleep.runId, "first", 1_000);
    const restarted = createCompatibilityHarness({
      namespace: harness.namespace,
      storage: harness.storage,
      now: () => 0,
    });
    try {
      const replay = restarted.native.resume(sleep.runId);
      assert.equal(replay.attempt, 1);
      assert.deepEqual(replay.waits, [{ key: "first", dueAt: 1_000, completed: false }]);
      restarted.native.commitWait(sleep.runId, "first", 1_000);
      restarted.native.completeWait(sleep.runId, "first");
      restarted.native.failAttempt(sleep.runId);
      restarted.native.beginAttempt(sleep.runId);
      restarted.native.commitWait(sleep.runId, "second", 2_000);
      restarted.native.resume(sleep.runId);
      restarted.native.completeWait(sleep.runId, "second");
      restarted.native.failAttempt(sleep.runId);
      const finalAttempt = restarted.native.beginAttempt(sleep.runId);
      assert.equal(finalAttempt.attempt, 3);
      assert.deepEqual(finalAttempt.waits, [
        { key: "first", dueAt: 1_000, completed: true },
        { key: "second", dueAt: 2_000, completed: true },
      ]);
    } finally {
      await restarted.close();
    }
  } finally {
    await harness.cleanup();
  }
}

if (import.meta.main) {
  await runRetrySleepProbe();
  console.log("retry-sleep: local acceptance, deduplication, replay and attempt checks passed");
}
