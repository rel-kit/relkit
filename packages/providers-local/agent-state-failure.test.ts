import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRequestScope, AgentStateLimits } from "@relkit/agents";
import { canonicalJson } from "@relkit/contracts";
import { createOperationId } from "@relkit/realtime";
import {
  createAgentStateProviderFromStore,
  createLocalAgentStateProvider,
} from "./src/agent-state/provider.js";
import { createAgentStateStore, type AgentStateStore } from "./src/agent-state/storage.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);

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

test("lost continuation and terminal acknowledgements recover without duplicate claims", async () => {
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

async function fixture(threadId: string) {
  const root = await mkdtemp(join(tmpdir(), "relkit-agent-failure-"));
  roots.push(root);
  const fault = faultingStore(createAgentStateStore(root));
  const provider = createAgentStateProviderFromStore(fault.store, 50);
  const scope = scopeFor(await provider.getEpoch());
  return { root, threadId, fault, provider, scope };
}

function load(
  provider: ReturnType<typeof createLocalAgentStateProvider>,
  scope: AgentRequestScope,
  threadId: string,
) {
  return provider.loadThread({ ...scope, threadId, maxEncodedBytes: limits.maxSnapshotBytes });
}

async function startRun(
  provider: ReturnType<typeof createLocalAgentStateProvider>,
  scope: AgentRequestScope,
  threadId: string,
  seed: number,
) {
  const now = new Date().toISOString();
  await provider.createThread({
    ...scope,
    operationId: operation(seed),
    threadId,
    semanticDigest: `thread-${seed}`,
    now,
    limits,
  });
  const run = await provider.acceptRun({
    ...scope,
    operationId: operation(seed + 1),
    semanticDigest: `run-${seed}`,
    threadId,
    owner: owner(),
    input: null,
    inputDigest: "null",
    acceptedAt: now,
    receiptExpiresAt: future(),
    limits,
  });
  const claim = await provider.claimRun({
    ...scope,
    threadId,
    runId: run.runId,
    workerId: `worker-${seed}`,
    generationId: "generation-a",
    expiresAt: future(),
  });
  return { runId: run.runId, claim };
}

function suspension(
  scope: AgentRequestScope,
  threadId: string,
  active: Awaited<ReturnType<typeof startRun>>,
  seed: number,
) {
  return {
    ...scope,
    operationId: operation(seed),
    threadId,
    runId: active.runId,
    claim: active.claim,
    waiting: {
      runId: active.runId,
      response: { type: "boolean" },
      requests: [{ node: "review", response: { type: "boolean" } }],
    },
    suspendedAt: new Date().toISOString(),
  } as const;
}

function faultingStore(base: AgentStateStore) {
  let next: "before" | "after" | undefined;
  return {
    store: {
      read: base.read,
      async update(change) {
        const phase = next;
        next = undefined;
        if (phase === "before") throw new Error("injected-before");
        const value = await base.update(change);
        if (phase === "after") throw new Error("injected-after");
        return value;
      },
    } satisfies AgentStateStore,
    failNext(phase: "before" | "after") {
      next = phase;
    },
  };
}

function scopeFor(providerEpoch: string): AgentRequestScope {
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
function operation(seed: number) {
  return createOperationId(Date.now() - seed);
}
function future() {
  return new Date(Date.now() + 86_400_000).toISOString();
}
function digest(value: unknown) {
  return `sha256:${createHash("sha256")
    .update(canonicalJson(value as never))
    .digest("hex")}`;
}
