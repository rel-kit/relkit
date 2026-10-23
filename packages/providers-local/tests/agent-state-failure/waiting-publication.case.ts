/** Preserves the native waiting publication state scenario. */
import { expect, test } from "vitest";
import { fixture, load, startRun, suspension } from "./fixture.js";
import { createLocalAgentStateProvider } from "../../src/agent-state/provider.js";

test("waiting publication is atomic across both store failure boundaries", async () => {
  const setup = await fixture("waiting-failure");
  const active = await startRun(setup.provider, setup.scope, setup.threadId, 1);
  const request = suspension(setup.scope, setup.threadId, active, 4);

  setup.fault.failNext("before");
  await expect(setup.provider.suspendRun(request)).rejects.toThrow("injected-before");
  let restarted = createLocalAgentStateProvider(setup.root, { pollingMs: 50 });
  let snapshot = await load(restarted, setup.scope, setup.threadId);
  expect(snapshot).toMatchObject({
    thread: { status: "running" },
    currentRuns: [{ status: "running" }],
  });
  expect(snapshot.waiting).toBeUndefined();
  expect(snapshot.checkpoint.sequence).toBe("0");

  setup.fault.failNext("after");
  await expect(setup.provider.suspendRun(request)).rejects.toThrow("injected-after");
  restarted = createLocalAgentStateProvider(setup.root, { pollingMs: 50 });
  snapshot = await load(restarted, setup.scope, setup.threadId);
  expect(snapshot).toMatchObject({
    thread: { status: "waiting", revision: "2" },
    currentRuns: [{ status: "waiting" }],
    waiting: { runId: active.runId, revision: "2" },
    checkpoint: { sequence: "1" },
  });
  const journal = await restarted.readJournal({
    ...setup.scope,
    threadId: setup.threadId,
    after: { ...snapshot.checkpoint, sequence: "0" },
    limit: 10,
    maxEncodedBytes: 4 * 1024,
  });
  expect(journal.records).toHaveLength(1);
  expect(journal.records[0]).toMatchObject({ kind: "interruption", publicValue: snapshot.waiting });
});
