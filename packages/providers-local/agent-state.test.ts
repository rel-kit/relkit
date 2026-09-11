import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  AgentExecutionEvent,
  AgentRequestScope,
  AgentStateLimits,
  AgentStateProvider,
  ExecutionClaim,
} from "@relkit/agents";
import { canonicalJson } from "@relkit/contracts";
import { createOperationId } from "@relkit/realtime";
import { createLocalAgentStateProvider } from "./src/agent-state/provider.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true }))));

const limits: AgentStateLimits = {
  maxSnapshotBytes: 4 * 1024 * 1024,
  maxHistoryPageBytes: 4 * 1024 * 1024,
  maxJournalRecordBytes: 256 * 1024,
  maxJournalBytesPerThread: 16 * 1024 * 1024,
  maxStateBytesPerApplication: 1024 * 1024 * 1024,
  maxThreadsPerPrincipal: 100,
  maxActiveRunsPerPrincipal: 4,
  maxActiveRunsPerApplication: 100,
  terminalReserveBytes: 32 * 1024,
  terminalReserveRecords: 4,
};

test("completion receipt wins after claim release and terminal state is atomic", async () => {
  const { provider, scope } = await setup();
  const now = new Date().toISOString();
  const created = await provider.createThread({
    ...scope,
    operationId: operationId(1),
    threadId: "completion-thread",
    semanticDigest: "thread",
    now,
    limits,
  });
  const accepted = await provider.acceptRun({
    ...scope,
    operationId: operationId(2),
    semanticDigest: "run",
    threadId: created.threadId,
    owner: owner(),
    input: { message: "hello" },
    inputDigest: "input",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  const claim = await provider.claimRun({
    ...scope,
    threadId: created.threadId,
    runId: accepted.runId,
    workerId: "worker",
    generationId: "generation-a",
    expiresAt: future(1),
  });
  const request = {
    ...scope,
    operationId: operationId(3),
    semanticDigest: "completion",
    threadId: created.threadId,
    runId: accepted.runId,
    claim,
    outcome: "succeeded" as const,
    terminalRecord: {
      recordId: "terminal",
      runId: accepted.runId,
      kind: "terminal" as const,
      publicValue: { answer: "done" },
      encodedBytes: 100,
      createdAt: now,
    },
    settledAt: now,
    receiptExpiresAt: future(30),
  };
  const first = await provider.completeRun(request);
  const retry = await provider.completeRun(request);
  expect(retry).toEqual({ ...first, duplicate: true });
  const snapshot = await provider.loadThread({
    ...scope,
    threadId: created.threadId,
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(snapshot.thread.status).toBe("idle");
  expect(snapshot.currentRuns[0]?.status).toBe("succeeded");
  expect(snapshot.executions).toEqual([]);
  expect(
    (
      await provider.readJournal({
        ...scope,
        threadId: created.threadId,
        after: { ...snapshot.checkpoint, sequence: "0" },
        limit: 10,
        maxEncodedBytes: 1024,
      })
    ).records,
  ).toHaveLength(1);
});

test("restores output, root values, and nested executions from the durable journal", async () => {
  const { provider, root, scope } = await setup();
  const now = new Date().toISOString();
  const thread = await provider.createThread({
    ...scope,
    operationId: operationId(10),
    threadId: "projection-thread",
    semanticDigest: "projection-thread",
    now,
    limits,
  });
  const run = await provider.acceptRun({
    ...scope,
    operationId: operationId(11),
    semanticDigest: "projection-run",
    threadId: thread.threadId,
    owner: owner(),
    input: { message: "go" },
    inputDigest: "projection-input",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  const claim = await provider.claimRun({
    ...scope,
    threadId: thread.threadId,
    runId: run.runId,
    workerId: "projection-worker",
    generationId: "generation-a",
    expiresAt: future(1),
  });
  const childScope = ["tools:delegate", "model:one"];
  await appendExecution(provider, scope, thread.threadId, run.runId, claim, 12, {
    nativeSequence: 1,
    kind: "values",
    scope: [],
    occurredAt: now,
    value: { todos: ["root"], phase: "planning" },
  });
  await appendExecution(provider, scope, thread.threadId, run.runId, claim, 13, {
    nativeSequence: 2,
    kind: "values",
    scope: [],
    occurredAt: now,
    value: { phase: "working" },
  });
  await appendExecution(provider, scope, thread.threadId, run.runId, claim, 14, {
    nativeSequence: 3,
    kind: "lifecycle",
    scope: childScope,
    occurredAt: now,
    agent: "researcher",
    parent: { kind: "tool", toolCallId: "delegate", toolId: "task" },
    node: "model_request",
    value: { event: "started" },
  });
  await appendExecution(provider, scope, thread.threadId, run.runId, claim, 15, {
    nativeSequence: 4,
    kind: "values",
    scope: childScope,
    occurredAt: now,
    value: { todos: ["child"] },
  });
  await appendExecution(provider, scope, thread.threadId, run.runId, claim, 16, {
    nativeSequence: 5,
    kind: "values",
    scope: ["unknown-without-lifecycle"],
    occurredAt: now,
    value: { hidden: false },
  });
  await appendExecution(provider, scope, thread.threadId, run.runId, claim, 17, {
    nativeSequence: 6,
    kind: "lifecycle",
    scope: childScope,
    occurredAt: now,
    value: { event: "completed" },
  });
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
});

test("waiting publication is atomic and remains stable across provider restart", async () => {
  const { provider, root, scope } = await setup();
  const now = new Date().toISOString();
  const thread = await provider.createThread({
    ...scope,
    operationId: operationId(80),
    threadId: "waiting-thread",
    semanticDigest: "waiting-thread",
    now,
    limits,
  });
  const run = await provider.acceptRun({
    ...scope,
    operationId: operationId(81),
    semanticDigest: "waiting-run",
    threadId: thread.threadId,
    owner: owner(),
    input: { orderId: "order-1" },
    inputDigest: "waiting-input",
    acceptedAt: new Date(Date.now() - 60_000).toISOString(),
    receiptExpiresAt: future(30),
    limits,
  });
  const claim = await provider.claimRun({
    ...scope,
    threadId: thread.threadId,
    runId: run.runId,
    workerId: "waiting-worker",
    generationId: "generation-a",
    expiresAt: future(1),
  });
  const waiting = {
    runId: run.runId,
    response: { type: "boolean" },
    requests: [{ node: "review", value: { total: 42 }, response: { type: "boolean" } }],
  } as const;
  const receipt = await provider.suspendRun({
    ...scope,
    operationId: operationId(82),
    threadId: thread.threadId,
    runId: run.runId,
    claim,
    waiting,
    suspendedAt: now,
  });

  expect(receipt).toMatchObject({
    status: "waiting",
    waiting: { ...waiting, revision: "2" },
    checkpoint: { sequence: "1" },
  });
  const restarted = createLocalAgentStateProvider(root, { pollingMs: 50 });
  const snapshot = await restarted.loadThread({
    ...scope,
    threadId: thread.threadId,
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(snapshot).toMatchObject({
    thread: { status: "waiting", revision: "2" },
    activeRun: { runId: run.runId },
    currentRuns: [{ runId: run.runId, status: "waiting" }],
    waiting: { ...waiting, revision: "2" },
    checkpoint: { sequence: "1" },
  });
  const journal = await restarted.readJournal({
    ...scope,
    threadId: thread.threadId,
    after: { ...snapshot.checkpoint, sequence: "0" },
    limit: 10,
    maxEncodedBytes: 1024,
  });
  expect(journal.records).toMatchObject([
    { runId: run.runId, kind: "interruption", publicValue: { ...waiting, revision: "2" } },
  ]);
  await expect(
    restarted.appendJournal({
      ...scope,
      threadId: thread.threadId,
      runId: run.runId,
      claim,
      operationId: operationId(83),
      semanticDigest: "stale-write",
      record: {
        recordId: "stale-write",
        runId: run.runId,
        kind: "progress",
        publicValue: null,
        encodedBytes: 4,
        createdAt: now,
      },
      limits,
    }),
  ).rejects.toMatchObject({ code: "CLAIM_LOST" });
  const waitingState = { ...waiting, revision: "2" };
  const continuationRequest = {
    ...scope,
    kind: "resume" as const,
    operationId: operationId(85),
    semanticDigest: "resume-false-at-revision-2",
    threadId: thread.threadId,
    interruptedRunId: run.runId,
    interruptSetDigest: digest(waitingState),
    waitingRevision: "2",
    admittedAt: now,
    receiptExpiresAt: future(30),
  };
  const continuation = await restarted.admitContinuation(continuationRequest);
  const duplicate = await restarted.admitContinuation(continuationRequest);
  const resumed = await restarted.loadThread({
    ...scope,
    threadId: thread.threadId,
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(continuation).toMatchObject({ waitingRevision: "2", duplicate: false });
  expect(duplicate).toEqual({ ...continuation, duplicate: true });
  expect(resumed).toMatchObject({
    thread: { status: "running", revision: "3" },
    currentRuns: [{ status: "waiting" }, { runId: continuation.runId, status: "accepted" }],
  });
  expect(resumed.waiting).toBeUndefined();
});

test("continuation rejects a digest for any other waiting contract", async () => {
  const { provider, scope } = await setup();
  const suspended = await createWaitingRun(provider, scope, "contract-bound-resume", 86);

  await expect(
    provider.admitContinuation({
      ...scope,
      kind: "resume",
      operationId: operationId(89),
      semanticDigest: "wrong-waiting-contract",
      threadId: "contract-bound-resume",
      interruptedRunId: suspended.runId,
      interruptSetDigest: digest({ ...suspended.waiting, response: { type: "string" } }),
      waitingRevision: suspended.waiting.revision,
      admittedAt: new Date().toISOString(),
      receiptExpiresAt: future(30),
    }),
  ).rejects.toMatchObject({ code: "STALE_CONTINUATION" });
  const snapshot = await provider.loadThread({
    ...scope,
    threadId: "contract-bound-resume",
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(snapshot.thread.status).toBe("waiting");
  expect(snapshot.waiting).toEqual(suspended.waiting);
});

test("an older waiting revision cannot resume a newer interruption", async () => {
  const { provider, scope } = await setup();
  const first = await createWaitingRun(provider, scope, "repeated-wait", 130);
  const admittedAt = new Date().toISOString();
  const resumed = await provider.admitContinuation({
    ...scope,
    kind: "resume",
    operationId: operationId(133),
    semanticDigest: "first-resume",
    threadId: "repeated-wait",
    interruptedRunId: first.runId,
    interruptSetDigest: digest(first.waiting),
    waitingRevision: first.waiting.revision,
    admittedAt,
    receiptExpiresAt: future(30),
  });
  const claim = await provider.claimRun({
    ...scope,
    threadId: "repeated-wait",
    runId: resumed.runId,
    workerId: "second-worker",
    generationId: "generation-a",
    expiresAt: future(1),
  });
  const second = await provider.suspendRun({
    ...scope,
    operationId: operationId(134),
    threadId: "repeated-wait",
    runId: resumed.runId,
    claim,
    waiting: {
      runId: resumed.runId,
      response: { type: "string" },
      requests: [{ node: "second-review", response: { type: "string" } }],
    },
    suspendedAt: admittedAt,
  });

  await expect(
    provider.admitContinuation({
      ...scope,
      kind: "resume",
      operationId: operationId(135),
      semanticDigest: "stale-first-resume",
      threadId: "repeated-wait",
      interruptedRunId: first.runId,
      interruptSetDigest: digest(first.waiting),
      waitingRevision: first.waiting.revision,
      admittedAt,
      receiptExpiresAt: future(30),
    }),
  ).rejects.toMatchObject({ code: "STALE_CONTINUATION" });
  expect(
    (
      await provider.loadThread({
        ...scope,
        threadId: "repeated-wait",
        maxEncodedBytes: limits.maxSnapshotBytes,
      })
    ).waiting,
  ).toEqual(second.waiting);
});

test("competing continuation operations admit exactly one resumed segment", async () => {
  const { provider, scope } = await setup();
  const suspended = await createWaitingRun(provider, scope, "competing-resume", 90);
  const request = {
    ...scope,
    kind: "resume" as const,
    semanticDigest: "competing-resume",
    threadId: "competing-resume",
    interruptedRunId: suspended.runId,
    interruptSetDigest: digest(suspended.waiting),
    waitingRevision: suspended.waiting.revision,
    admittedAt: new Date().toISOString(),
    receiptExpiresAt: future(30),
  };
  const results = await Promise.allSettled([
    provider.admitContinuation({ ...request, operationId: operationId(93) }),
    provider.admitContinuation({ ...request, operationId: operationId(94) }),
  ]);

  expect(results.map(({ status }) => status).sort()).toEqual(["fulfilled", "rejected"]);
  const accepted = results.find((result) => result.status === "fulfilled");
  const rejected = results.find((result) => result.status === "rejected");
  if (accepted?.status !== "fulfilled" || rejected?.status !== "rejected") {
    throw new Error("Expected one accepted and one rejected continuation.");
  }
  expect(accepted.value.duplicate).toBe(false);
  expect(rejected.reason).toMatchObject({ code: "STALE_CONTINUATION" });
  const snapshot = await provider.loadThread({
    ...scope,
    threadId: "competing-resume",
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(snapshot.currentRuns.filter(({ status }) => status === "accepted")).toHaveLength(1);
  expect(snapshot.activeRun?.runId).toBe(accepted.value.runId);
  expect(snapshot.waiting).toBeUndefined();
});

test("continuation admission is isolated by exact thread and owner scope", async () => {
  const { provider, scope } = await setup();
  const first = await createWaitingRun(provider, scope, "isolated-resume", 100);
  await createWaitingRun(provider, scope, "other-thread", 110);
  const otherScope = { ...scope, ownerScope: "other-owner", authorizationGrantId: "other-grant" };
  await createWaitingRun(provider, otherScope, "isolated-resume", 120);
  const attempt = {
    kind: "resume" as const,
    semanticDigest: "foreign-resume",
    interruptedRunId: first.runId,
    interruptSetDigest: digest(first.waiting),
    waitingRevision: first.waiting.revision,
    admittedAt: new Date().toISOString(),
    receiptExpiresAt: future(30),
  };

  await expect(
    provider.admitContinuation({
      ...scope,
      ...attempt,
      operationId: operationId(123),
      threadId: "other-thread",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    provider.admitContinuation({
      ...otherScope,
      ...attempt,
      operationId: operationId(124),
      threadId: "isolated-resume",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  const snapshot = await provider.loadThread({
    ...scope,
    threadId: "isolated-resume",
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(snapshot.thread.status).toBe("waiting");
  expect(snapshot.waiting?.runId).toBe(first.runId);
  const operation = operationId(125);
  await provider.admitContinuation({
    ...scope,
    ...attempt,
    operationId: operation,
    threadId: "isolated-resume",
  });
  await expect(
    provider.admitContinuation({
      ...scope,
      ...attempt,
      operationId: operation,
      threadId: "other-thread",
    }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
});

test("stale interruption cannot overwrite a renewed claim", async () => {
  const { provider, scope } = await setup();
  const now = new Date().toISOString();
  const thread = await provider.createThread({
    ...scope,
    operationId: operationId(4),
    threadId: "stale-interruption-thread",
    semanticDigest: "t",
    now,
    limits,
  });
  const run = await provider.acceptRun({
    ...scope,
    operationId: operationId(5),
    semanticDigest: "r",
    threadId: thread.threadId,
    owner: owner(),
    input: null,
    inputDigest: "i",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  const claim = await provider.claimRun({
    ...scope,
    threadId: thread.threadId,
    runId: run.runId,
    workerId: "w",
    generationId: "generation-a",
    expiresAt: future(1),
  });
  const renewed = await provider.renewRunClaim({
    ...scope,
    threadId: thread.threadId,
    runId: run.runId,
    claim,
    expiresAt: future(2),
  });
  const result = await provider.interruptOwnedRun({
    ...scope,
    operationId: operationId(6),
    threadId: thread.threadId,
    runId: run.runId,
    expectedOwner: owner(),
    expectedClaimId: "stale",
    expectedFence: renewed.fence,
    reason: "claim-expired",
    interruptedAt: now,
  });
  expect(result.changed).toBe(false);
  expect(
    (
      await provider.loadThread({
        ...scope,
        threadId: thread.threadId,
        maxEncodedBytes: limits.maxSnapshotBytes,
      })
    ).currentRuns[0]?.status,
  ).toBe("running");
});

test("provider observation records interruption after executor claim expiry", async () => {
  const { provider, scope } = await setup();
  const now = new Date().toISOString();
  const thread = await provider.createThread({
    ...scope,
    operationId: operationId(40),
    threadId: "expired-claim-thread",
    semanticDigest: "expired-thread",
    now,
    limits,
  });
  const run = await provider.acceptRun({
    ...scope,
    operationId: operationId(41),
    semanticDigest: "expired-run",
    threadId: thread.threadId,
    owner: owner(),
    input: null,
    inputDigest: "input",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  await provider.claimRun({
    ...scope,
    threadId: thread.threadId,
    runId: run.runId,
    workerId: "dead-worker",
    generationId: "generation-a",
    expiresAt: new Date(Date.now() - 1).toISOString(),
  });

  const snapshot = await provider.loadThread({
    ...scope,
    threadId: thread.threadId,
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(snapshot.thread.status).toBe("worker-interrupted");
  expect(snapshot.currentRuns).toMatchObject([
    { runId: run.runId, status: "worker-interrupted", outcome: "worker-interrupted" },
  ]);
  const journal = await provider.readJournal({
    ...scope,
    threadId: thread.threadId,
    after: { ...snapshot.checkpoint, sequence: "0" },
    limit: 10,
    maxEncodedBytes: 1024,
  });
  expect(journal.records).toMatchObject([
    { runId: run.runId, kind: "interruption", publicValue: { reason: "claim-expired" } },
  ]);
});

test("thread snapshots pin bounded older history for authenticated pagination", async () => {
  const { provider, scope } = await setup();
  const now = new Date().toISOString();
  const thread = await provider.createThread({
    ...scope,
    operationId: operationId(7),
    threadId: "history-thread",
    semanticDigest: "thread-history",
    now,
    limits,
  });
  const run = await provider.acceptRun({
    ...scope,
    operationId: operationId(8),
    semanticDigest: "run-history",
    threadId: thread.threadId,
    owner: owner(),
    input: null,
    inputDigest: "input",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  const claim = await provider.claimRun({
    ...scope,
    threadId: thread.threadId,
    runId: run.runId,
    workerId: "history-worker",
    generationId: "generation-a",
    expiresAt: future(1),
  });
  for (let index = 0; index < 3; index += 1) {
    const message = {
      messageId: `message-${index}`,
      role: "assistant" as const,
      parts: [{ partId: `part-${index}`, kind: "text" as const, text: "x".repeat(700) }],
      createdAt: now,
    };
    await provider.appendJournal({
      ...scope,
      threadId: thread.threadId,
      runId: run.runId,
      claim,
      operationId: operationId(9 + index),
      semanticDigest: `message-${index}`,
      record: {
        recordId: `record-${index}`,
        runId: run.runId,
        kind: "message",
        publicValue: message,
        encodedBytes: JSON.stringify(message).length,
        createdAt: now,
      },
      limits,
    });
  }
  const snapshot = await provider.loadThread({
    ...scope,
    threadId: thread.threadId,
    maxEncodedBytes: 1_800,
  });
  expect(snapshot.hasOlderHistory).toBe(true);
  const history = await provider.readSnapshotHistory({
    ...scope,
    threadId: thread.threadId,
    snapshotId: snapshot.snapshotId,
    cursor: snapshot.olderHistoryCursor!,
    maxEncodedBytes: limits.maxHistoryPageBytes,
  });
  expect([...history.messages, ...snapshot.currentMessages]).toHaveLength(3);
});

test("expired control recovery reconciles an admitted follow-up run", async () => {
  const { provider, scope } = await setup();
  const now = new Date().toISOString();
  const thread = await provider.createThread({
    ...scope,
    operationId: operationId(20),
    threadId: "control-thread",
    semanticDigest: "control-thread",
    now,
    limits,
  });
  const first = await provider.acceptRun({
    ...scope,
    operationId: operationId(21),
    semanticDigest: "first-run",
    threadId: thread.threadId,
    owner: owner(),
    input: "first",
    inputDigest: "first",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  const runClaim = await provider.claimRun({
    ...scope,
    threadId: thread.threadId,
    runId: first.runId,
    workerId: "run-worker",
    generationId: "generation-a",
    expiresAt: future(1),
  });
  const controlId = operationId(22);
  await provider.acceptControl({
    ...scope,
    operationId: controlId,
    semanticDigest: "follow-up",
    threadId: thread.threadId,
    runId: first.runId,
    kind: "follow-up",
    publicPayload: "second",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits: { maxQueuedPerRun: 32, maxQueuedPerApplication: 10_000 },
  });
  const controlClaim = await provider.claimControl({
    ...scope,
    threadId: thread.threadId,
    runId: first.runId,
    operationId: controlId,
    workerId: "control-worker",
    generationId: "generation-a",
    expiresAt: new Date(Date.now() + 100).toISOString(),
  });
  await provider.markControlEffectStarted({
    ...scope,
    threadId: thread.threadId,
    runId: first.runId,
    operationId: controlId,
    claim: controlClaim,
    downstreamOperationId: controlId,
  });
  await provider.completeRun({
    ...scope,
    operationId: operationId(23),
    semanticDigest: "first-complete",
    threadId: thread.threadId,
    runId: first.runId,
    claim: runClaim,
    outcome: "succeeded",
    terminalRecord: {
      recordId: "first-terminal",
      runId: first.runId,
      kind: "terminal",
      publicValue: null,
      encodedBytes: 4,
      createdAt: now,
    },
    settledAt: now,
    receiptExpiresAt: future(30),
  });
  const betweenSegments = await provider.loadThread({
    ...scope,
    threadId: thread.threadId,
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(betweenSegments.thread.status).toBe("running");
  expect(betweenSegments.currentRuns.find((item) => item.runId === first.runId)?.status).toBe(
    "succeeded",
  );
  await provider.acceptRun({
    ...scope,
    operationId: controlId,
    semanticDigest: "follow-up",
    threadId: thread.threadId,
    owner: owner(),
    input: "second",
    inputDigest: "second",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  await Bun.sleep(110);
  const snapshot = await provider.loadThread({
    ...scope,
    threadId: thread.threadId,
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(snapshot.controls).toMatchObject([{ status: "applied", effect: "confirmed" }]);
  expect(snapshot.currentRuns).toHaveLength(2);
  expect(snapshot.currentRuns[0]?.status).toBe("succeeded");
  expect(snapshot.thread.status).toBe("running");
});

test("thread ownership survives a same-principal session replacement only", async () => {
  const { provider, scope } = await setup();
  const thread = await provider.createThread({
    ...scope,
    operationId: operationId(50),
    threadId: "session-thread",
    semanticDigest: "session-thread",
    now: new Date().toISOString(),
    limits,
  });
  await expect(
    provider.loadThread({
      ...scope,
      sessionEpoch: "replacement-session",
      threadId: thread.threadId,
      maxEncodedBytes: limits.maxSnapshotBytes,
    }),
  ).resolves.toMatchObject({ thread: { threadId: thread.threadId } });
  await expect(
    provider.loadThread({
      ...scope,
      identityScope: "other-principal",
      ownerScope: "other-owner",
      sessionEpoch: "other-session",
      threadId: thread.threadId,
      maxEncodedBytes: limits.maxSnapshotBytes,
    }),
  ).rejects.toThrow("Thread was not found");
});

test("a pruned operation remains distinguishable from a current-epoch miss", async () => {
  const { provider, scope } = await setup();
  const now = new Date().toISOString();
  expect(
    await provider.lookupRunReceipt({
      ...scope,
      operationId: createOperationId(Date.now() - 31 * 86_400_000),
      semanticDigest: "old",
      now,
    }),
  ).toMatchObject({ status: "expired" });
  expect(
    await provider.lookupRunReceipt({
      ...scope,
      operationId: createOperationId(),
      semanticDigest: "new",
      now,
    }),
  ).toMatchObject({ status: "not-found", providerEpoch: scope.providerEpoch });
});

test("caller thread IDs are exact, ensured, and isolated by agent ownership", async () => {
  const { provider, scope } = await setup();
  const now = new Date().toISOString();
  const sharedOperationId = operationId(60);
  const threadId = "order:123 / review";
  const first = await provider.createThread({
    ...scope,
    operationId: sharedOperationId,
    threadId,
    semanticDigest: "first-thread",
    now,
    limits,
  });
  const ensured = await provider.createThread({
    ...scope,
    operationId: operationId(61),
    threadId,
    semanticDigest: "ensure-thread",
    now: future(1),
    limits,
  });
  const otherScope = { ...scope, agentId: "reviewer", ownerScope: "other-owner" };
  const other = await provider.createThread({
    ...otherScope,
    operationId: sharedOperationId,
    threadId,
    semanticDigest: "other-thread",
    now,
    limits,
  });

  expect(first).toEqual(ensured);
  expect(other.threadId).toBe(threadId);
  expect((await provider.listThreads({ ...scope, limit: 10 })).threads).toHaveLength(1);
  expect((await provider.listThreads({ ...otherScope, limit: 10 })).threads).toHaveLength(1);

  const runOperationId = operationId(62);
  const run = await provider.acceptRun({
    ...scope,
    operationId: runOperationId,
    semanticDigest: "isolated-run",
    threadId,
    owner: owner(),
    input: null,
    inputDigest: "null",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  expect(run.threadId).toBe(threadId);
  expect(
    (await provider.loadThread({ ...scope, threadId, maxEncodedBytes: limits.maxSnapshotBytes }))
      .thread.status,
  ).toBe("running");
  expect(
    (
      await provider.loadThread({
        ...otherScope,
        threadId,
        maxEncodedBytes: limits.maxSnapshotBytes,
      })
    ).thread.status,
  ).toBe("idle");
  const otherRun = await provider.acceptRun({
    ...otherScope,
    operationId: runOperationId,
    semanticDigest: "other-isolated-run",
    threadId,
    owner: owner(),
    input: null,
    inputDigest: "null",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  expect(otherRun.threadId).toBe(threadId);
});

test("empty caller thread IDs are rejected without normalization", async () => {
  const { provider, scope } = await setup();
  for (const threadId of ["", "   "]) {
    await expect(
      provider.createThread({
        ...scope,
        operationId: operationId(70 + threadId.length),
        threadId,
        semanticDigest: "invalid-thread",
        now: new Date().toISOString(),
        limits,
      }),
    ).rejects.toMatchObject({ code: "INVALID_THREAD_ID" });
  }
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "relkit-agent-state-"));
  roots.push(root);
  const provider = createLocalAgentStateProvider(root, { pollingMs: 50 });
  while (!(await Bun.file(join(root, "agent-state.json")).exists())) await Bun.sleep(1);
  const state = JSON.parse(await readFile(join(root, "agent-state.json"), "utf8")) as {
    providerEpoch: string;
  };
  return { provider, root, scope: baseScope(state.providerEpoch) };
}

function baseScope(providerEpoch: string): AgentRequestScope {
  return {
    applicationId: "app",
    environment: "test",
    profile: "default",
    providerEpoch,
    agentId: "assistant",
    ownerScope: "owner",
    authorizationGrantId: "grant",
    identityScope: "principal",
    sessionEpoch: "session",
  };
}

function owner() {
  return {
    generationId: "generation-a",
    publicFingerprint: "fp",
    protocolVersion: 1,
    schemaVersion: 1,
    providerScope: "default",
  };
}

function operationId(last: number) {
  return createOperationId(Date.now() - last);
}

function future(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(canonicalJson(value as never))
    .digest("hex")}`;
}

function appendExecution(
  provider: AgentStateProvider,
  scope: AgentRequestScope,
  threadId: string,
  runId: string,
  claim: ExecutionClaim,
  seed: number,
  event: AgentExecutionEvent,
) {
  return provider.appendJournal({
    ...scope,
    threadId,
    runId,
    claim,
    operationId: operationId(seed),
    semanticDigest: digest(event),
    record: {
      recordId: `event-${seed}`,
      runId,
      kind: "event",
      publicValue: event,
      encodedBytes: 100,
      createdAt: event.occurredAt,
    },
    limits,
  });
}

async function createWaitingRun(
  provider: AgentStateProvider,
  scope: AgentRequestScope,
  threadId: string,
  seed: number,
) {
  const now = new Date().toISOString();
  await provider.createThread({
    ...scope,
    operationId: operationId(seed),
    threadId,
    semanticDigest: `thread-${seed}`,
    now,
    limits,
  });
  const run = await provider.acceptRun({
    ...scope,
    operationId: operationId(seed + 1),
    semanticDigest: `run-${seed}`,
    threadId,
    owner: owner(),
    input: null,
    inputDigest: "null",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  const claim = await provider.claimRun({
    ...scope,
    threadId,
    runId: run.runId,
    workerId: `worker-${seed}`,
    generationId: "generation-a",
    expiresAt: future(1),
  });
  const receipt = await provider.suspendRun({
    ...scope,
    operationId: operationId(seed + 2),
    threadId,
    runId: run.runId,
    claim,
    waiting: {
      runId: run.runId,
      response: { type: "boolean" },
      requests: [{ node: "review", response: { type: "boolean" } }],
    },
    suspendedAt: now,
  });
  return { runId: run.runId, waiting: receipt.waiting };
}
