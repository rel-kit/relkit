import { strict as assert } from "node:assert";
import { createCompatibilityHarness } from "./harness.ts";

export async function runVersionRoutingProbe(): Promise<void> {
  const harness = createCompatibilityHarness({ now: () => 10 });
  try {
    const oldRun = await harness.native.submit({ key: "same-key", buildId: "build-old" });
    const duplicate = await harness.native.submit({ key: "same-key", buildId: "build-new" });
    assert.equal(duplicate.runId, oldRun.runId);
    assert.equal((await harness.native.get(oldRun.runId)).buildId, "build-old");

    const newRun = await harness.native.submit({ key: "new-key", buildId: "build-new" });
    assert.notEqual(newRun.runId, oldRun.runId);
    assert.equal((await harness.native.get(newRun.runId)).buildId, "build-new");

    const retention = (await harness.native.get(oldRun.runId)).retentionExpiresAt;
    const restarted = createCompatibilityHarness({
      namespace: harness.namespace,
      storage: harness.storage,
      now: () => 20,
    });
    try {
      const historical = await restarted.native.get(oldRun.runId);
      assert.equal(historical.buildId, "build-old");
      assert.equal(historical.retentionExpiresAt, retention);
    } finally {
      await restarted.close();
    }
  } finally {
    await harness.cleanup();
  }
}

if (import.meta.main) {
  await runVersionRoutingProbe();
  console.log("version-routing: first-wins and restart identity checks passed");
}
