import { strict as assert } from "node:assert";
import { createCompatibilityHarness } from "./harness.ts";

export async function runWatchLifecycleProbe(): Promise<void> {
  const harness = createCompatibilityHarness({ now: () => 0 });
  harness.workers.start("worker-1");
  try {
    const receipt = await harness.native.submit({ key: "watch:1", buildId: "build-1" });
    const stream = harness.native.observe(receipt.runId)[Symbol.asyncIterator]();
    const initial = await stream.next();
    assert.equal(initial.done, false);
    assert.equal(initial.value?.kind, "snapshot");
    assert.equal(initial.value?.run.runId, receipt.runId);

    harness.native.beginAttempt(receipt.runId);
    const running = await stream.next();
    assert.equal(running.value?.run.status, "running");
    assert.equal(running.value?.sequence, 1);

    const disconnected = harness.native.observe(receipt.runId)[Symbol.asyncIterator]();
    await disconnected.next();
    await disconnected.return?.();
    assert.equal((await harness.native.get(receipt.runId)).status, "running");

    harness.native.complete(receipt.runId);
    const terminal = await stream.next();
    assert.equal(terminal.value?.run.status, "completed");
    assert.equal((await stream.next()).done, true);
    assert.deepEqual(
      [initial.value?.sequence, running.value?.sequence, terminal.value?.sequence],
      [0, 1, 2],
    );
  } finally {
    await harness.close();
    assert.equal(harness.workers.active.size, 0);
    await harness.cleanup();
  }
}

if (import.meta.main) {
  await runWatchLifecycleProbe();
  console.log("watch-lifecycle: snapshot/update/terminal cleanup checks passed");
}
