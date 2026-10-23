/** Preserves the native continuation recovery state scenario. */
import { expect, test } from "vitest";
import { fixture, load, startRun, suspension } from "./fixture.js";
import { operation, future, digest } from "./identity.js";
import { createLocalAgentStateProvider } from "../../src/agent-state/provider.js";

test("lost continuation and terminal acknowledgements recover without duplicate claims", async () => {
  const fixture = await suspendedContinuation();
  const { setup } = fixture;
  const { restarted, retry, claimed } = await recoverContinuationClaim(fixture);
  const terminal = {
    ...setup.scope,
    operationId: operation(15),
    semanticDigest: "terminal-receipt",
    threadId: setup.threadId,
    runId: retry.runId,
    claim: claimed.value,
    outcome: "succeeded" as const,
    terminalRecord: {
      recordId: "terminal-record",
      runId: retry.runId,
      kind: "terminal" as const,
      publicValue: { answer: "done" },
      encodedBytes: 32,
      createdAt: new Date().toISOString(),
    },
    settledAt: new Date().toISOString(),
    receiptExpiresAt: future(),
  };
  setup.fault.failNext("after");
  await expect(setup.provider.completeRun(terminal)).rejects.toThrow("injected-after");
  const completion = await restarted.completeRun(terminal);
  expect(completion.duplicate).toBe(true);
  const snapshot = await load(restarted, setup.scope, setup.threadId);
  expect(snapshot.thread.status).toBe("idle");
  expect(snapshot.currentRuns.filter(({ status }) => status === "succeeded")).toHaveLength(1);
  const journal = await restarted.readJournal({
    ...setup.scope,
    threadId: setup.threadId,
    after: { ...snapshot.checkpoint, sequence: "0" },
    limit: 10,
    maxEncodedBytes: 4 * 1024,
  });
  expect(journal.records.filter(({ kind }) => kind === "terminal")).toHaveLength(1);
});

/**
 * Creates the original suspended run and exact continuation contract.
 * @returns The owned provider and admitted state used by the following scenario phase.
 */
async function suspendedContinuation() {
  const setup = await fixture("resume-failure");
  const active = await startRun(setup.provider, setup.scope, setup.threadId, 10);
  await setup.provider.suspendRun(suspension(setup.scope, setup.threadId, active, 13));
  const waiting = (await load(setup.provider, setup.scope, setup.threadId)).waiting!;
  const continuation = {
    ...setup.scope,
    kind: "resume" as const,
    operationId: operation(14),
    semanticDigest: "resume-receipt",
    threadId: setup.threadId,
    interruptedRunId: active.runId,
    interruptSetDigest: digest(waiting),
    waitingRevision: waiting.revision,
    admittedAt: new Date().toISOString(),
    receiptExpiresAt: future(),
  };
  return { setup, active, waiting, continuation };
}

/**
 * Recovers a lost admission acknowledgement and retains exclusive physical claim ownership.
 * @param fixture - Owned provider, scope and previously admitted scenario state.
 * @returns The owned provider and admitted state used by the following scenario phase.
 */
async function recoverContinuationClaim(
  fixture: Awaited<ReturnType<typeof suspendedContinuation>>,
) {
  const { setup, continuation } = fixture;
  setup.fault.failNext("after");
  await expect(setup.provider.admitContinuation(continuation)).rejects.toThrow("injected-after");
  const restarted = createLocalAgentStateProvider(setup.root, { pollingMs: 50 });
  const retry = await restarted.admitContinuation(continuation);
  expect(retry.duplicate).toBe(true);
  expect((await load(restarted, setup.scope, setup.threadId)).waiting).toBeUndefined();
  setup.fault.failNext("before");
  await expect(
    setup.provider.claimRun({
      ...setup.scope,
      threadId: setup.threadId,
      runId: retry.runId,
      workerId: "failed-worker",
      generationId: "generation-a",
      expiresAt: future(),
    }),
  ).rejects.toThrow("injected-before");
  const contenders = await Promise.allSettled(
    ["worker-a", "worker-b"].map((workerId) =>
      createLocalAgentStateProvider(setup.root, { pollingMs: 50 }).claimRun({
        ...setup.scope,
        threadId: setup.threadId,
        runId: retry.runId,
        workerId,
        generationId: "generation-a",
        expiresAt: future(),
      }),
    ),
  );
  const claimed = contenders.find((result) => result.status === "fulfilled");
  expect(contenders.map(({ status }) => status).sort()).toEqual(["fulfilled", "rejected"]);
  if (claimed?.status !== "fulfilled") throw new Error("A resumed worker must own the claim.");
  return { restarted, retry, claimed };
}
