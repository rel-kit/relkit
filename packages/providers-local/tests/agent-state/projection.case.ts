/** Preserves durable root, output and nested execution projections. */
import { expect, test } from "vitest";
import { limits } from "./fixture.js";
import { operationId, owner, future } from "./identity.js";
import { createLocalAgentStateProvider } from "../../src/agent-state/provider.js";
import { projectionFixture, appendRootValues, appendNestedValues } from "./projection-fixture.js";

test("restores output, root values, and nested executions from the durable journal", async () => {
  const fixture = await projectionFixture();
  await appendRootValues(fixture);
  await appendNestedValues(fixture);
  await finishProjection(fixture);
  const restarted = await assertProjectionRestored(fixture);
  const next = await startNextProjection(fixture, restarted);
  await assertFailedProjection(fixture, restarted, next);
});

/**
 * Settles the first segment with its original output.
 * @param fixture - Owned provider, scope and previously admitted scenario state.
 * @returns After the scenario persistence and behavior assertions complete.
 */
async function finishProjection(fixture: Awaited<ReturnType<typeof projectionFixture>>) {
  const { provider, scope, now, thread, run, claim } = fixture;
  await provider.completeRun({
    ...scope,
    operationId: operationId(18),
    semanticDigest: "projection-complete",
    threadId: thread.threadId,
    runId: run.runId,
    claim,
    outcome: "succeeded",
    terminalRecord: {
      recordId: "projection-terminal",
      runId: run.runId,
      kind: "terminal",
      publicValue: { output: { answer: "done" } },
      encodedBytes: 40,
      createdAt: now,
    },
    settledAt: now,
    receiptExpiresAt: future(30),
  });
}

/**
 * Confirms restart restores every original durable projection field.
 * @param fixture - Owned provider, scope and previously admitted scenario state.
 * @returns The reopened provider after all retained output and nested execution assertions pass.
 */
async function assertProjectionRestored(fixture: Awaited<ReturnType<typeof projectionFixture>>) {
  const { root, scope, thread, childScope } = fixture;
  const restarted = createLocalAgentStateProvider(root, { pollingMs: 50 });
  const snapshot = await restarted.loadThread({
    ...scope,
    threadId: thread.threadId,
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(snapshot.values).toEqual({ todos: ["root"], phase: "working" });
  expect(snapshot.output).toEqual({ answer: "done" });
  expect(snapshot.executions).toEqual([
    {
      scope: childScope,
      agent: "researcher",
      parent: { kind: "tool", toolCallId: "delegate", toolId: "task" },
      node: "model_request",
      values: { todos: ["child"] },
      status: "succeeded",
      lastEventSequence: 6,
    },
  ]);
  return restarted;
}

/**
 * Starts the next segment and checks its previous output is absent.
 * @param fixture - Owned provider, scope and previously admitted scenario state.
 * @param restarted - Provider reopened on the same owned state directory.
 * @returns The next admitted segment and its physical execution claim.
 */
async function startNextProjection(
  fixture: Awaited<ReturnType<typeof projectionFixture>>,
  restarted: ReturnType<typeof createLocalAgentStateProvider>,
) {
  const { scope, thread } = fixture;
  const next = await restarted.acceptRun({
    ...scope,
    operationId: operationId(19),
    semanticDigest: "next-run",
    threadId: thread.threadId,
    owner: owner(),
    input: null,
    inputDigest: "null",
    acceptedAt: future(1),
    receiptExpiresAt: future(30),
    limits,
  });
  const running = await restarted.loadThread({
    ...scope,
    threadId: thread.threadId,
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(running).not.toHaveProperty("output");
  const nextClaim = await restarted.claimRun({
    ...scope,
    threadId: thread.threadId,
    runId: next.runId,
    workerId: "projection-worker-2",
    generationId: "generation-a",
    expiresAt: future(2),
  });
  return { next, nextClaim };
}

/**
 * Failed completion must never restore the preceding successful output.
 * @param fixture - Owned provider, scope and previously admitted scenario state.
 * @param restarted - Provider reopened on the same owned state directory.
 * @param segment - Following run and execution claim whose output must remain isolated.
 * @returns After the scenario persistence and behavior assertions complete.
 */
async function assertFailedProjection(
  fixture: Awaited<ReturnType<typeof projectionFixture>>,
  restarted: ReturnType<typeof createLocalAgentStateProvider>,
  segment: Awaited<ReturnType<typeof startNextProjection>>,
) {
  const { scope, thread } = fixture;
  const { next, nextClaim } = segment;
  await restarted.completeRun({
    ...scope,
    operationId: operationId(20),
    semanticDigest: "next-failed",
    threadId: thread.threadId,
    runId: next.runId,
    claim: nextClaim,
    outcome: "failed",
    terminalRecord: {
      recordId: "projection-failed",
      runId: next.runId,
      kind: "terminal",
      publicValue: { error: "safe" },
      encodedBytes: 24,
      createdAt: future(1),
    },
    settledAt: future(1),
    receiptExpiresAt: future(30),
  });
  const failed = await restarted.loadThread({
    ...scope,
    threadId: thread.threadId,
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(failed).not.toHaveProperty("output");
}
