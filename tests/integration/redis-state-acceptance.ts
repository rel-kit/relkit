import { expect } from "bun:test";
import {
  createRedisAgentStateProvider,
  createRedisRealtimeProvider,
} from "../../integrations/packages/redis/src/runtime/index.ts";
import type { AgentRequestScope, AgentStateLimits } from "../../packages/agents/src/index.ts";
import { createOperationId } from "../../packages/realtime/src/index.ts";

export async function exerciseSharedRedisProviders(url: string): Promise<void> {
  const profile = `acceptance-${crypto.randomUUID()}`;
  const realtimeA = createRedisRealtimeProvider({ url, profile });
  const realtimeB = createRedisRealtimeProvider({ url, profile });
  const agentA = createRedisAgentStateProvider({ url, profile });
  const agentB = createRedisAgentStateProvider({ url, profile });
  await Promise.all([realtimeA.ready(), realtimeB.ready(), agentA.ready(), agentB.ready()]);
  try {
    await exerciseRealtime(realtimeA, realtimeB, profile);
    await exerciseAgentState(agentA, agentB, profile);
  } finally {
    await Promise.all([realtimeA.close(), realtimeB.close(), agentA.close(), agentB.close()]);
  }
}

async function exerciseRealtime(
  reader: ReturnType<typeof createRedisRealtimeProvider>,
  writer: ReturnType<typeof createRedisRealtimeProvider>,
  profile: string,
): Promise<void> {
  const scope = {
    applicationId: "redis-acceptance",
    environment: "test",
    profile,
    providerEpoch: await reader.getEpoch(),
    channelId: "orders",
    partition: "one",
    identityScope: "owner",
    sessionEpoch: "session",
    policyEpoch: "policy",
  };
  const initial = await reader.readAfter({ ...scope, limit: 1, maxEncodedBytes: 64 * 1024 });
  const waiting = reader.waitAfter({
    ...scope,
    after: initial.checkpoint,
    deadlineMs: Date.now() + 5_000,
    signal: new AbortController().signal,
  });
  await writer.append({
    ...scope,
    operationId: createOperationId(),
    semanticDigest: "shared-event",
    event: "changed",
    payload: { ok: true },
    encodedBytes: 128,
    occurredAt: new Date().toISOString(),
    receiptExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    retentionMs: 300_000,
    maxEvents: 100,
    limits: realtimeLimits,
  });
  await waiting;
  const page = await reader.readAfter({
    ...scope,
    after: initial.checkpoint,
    limit: 1,
    maxEncodedBytes: 64 * 1024,
  });
  expect(page.events).toHaveLength(1);

  const concurrent = Array.from({ length: 20 }, (_, index) => `concurrent-${index}`);
  await Promise.all(
    concurrent.map((value, index) =>
      (index % 2 === 0 ? reader : writer).append({
        ...scope,
        event: "changed",
        payload: { value },
        encodedBytes: 128,
        occurredAt: new Date().toISOString(),
        retentionMs: 300_000,
        maxEvents: 100,
        limits: realtimeLimits,
      }),
    ),
  );
  const concurrentPage = await reader.readAfter({
    ...scope,
    after: page.checkpoint,
    limit: concurrent.length,
    maxEncodedBytes: 64 * 1024,
  });
  expect(
    concurrentPage.events.map((event) => (event.payload as { value: string }).value).sort(),
  ).toEqual(concurrent.sort());
}

async function exerciseAgentState(
  reader: ReturnType<typeof createRedisAgentStateProvider>,
  writer: ReturnType<typeof createRedisAgentStateProvider>,
  profile: string,
): Promise<void> {
  const scope = agentScope(profile, await reader.getEpoch());
  const now = new Date().toISOString();
  const thread = await reader.createThread({
    ...scope,
    operationId: createOperationId(),
    threadId: "redis-shared-thread",
    semanticDigest: "thread",
    now,
    limits: agentLimits,
  });
  const run = await reader.acceptRun({
    ...scope,
    operationId: createOperationId(),
    semanticDigest: "run",
    threadId: thread.threadId,
    owner: {
      generationId: "generation-a",
      publicFingerprint: "fingerprint",
      protocolVersion: 1,
      schemaVersion: 1,
      providerScope: profile,
    },
    input: { message: "hello" },
    inputDigest: "input",
    acceptedAt: now,
    receiptExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    limits: agentLimits,
  });
  const waiting = reader.waitForControls({
    ...scope,
    threadId: thread.threadId,
    runId: run.runId,
    afterSequence: "0",
    deadlineMs: Date.now() + 5_000,
    signal: new AbortController().signal,
  });
  const operationId = createOperationId();
  await writer.acceptControl({
    ...scope,
    operationId,
    semanticDigest: "stop",
    threadId: thread.threadId,
    runId: run.runId,
    kind: "stop",
    publicPayload: null,
    acceptedAt: now,
    receiptExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    limits: { maxQueuedPerRun: 32, maxQueuedPerApplication: 10_000 },
  });
  await waiting;
  const page = await reader.readControls({
    ...scope,
    threadId: thread.threadId,
    runId: run.runId,
    afterSequence: "0",
    limit: 1,
  });
  expect(page.operationIds).toEqual([operationId]);
}

function agentScope(profile: string, providerEpoch: string): AgentRequestScope {
  return {
    applicationId: "redis-acceptance",
    environment: "test",
    profile,
    providerEpoch,
    agentId: "assistant",
    ownerScope: "owner",
    authorizationGrantId: "grant",
    identityScope: "principal",
    sessionEpoch: "session",
  };
}

const realtimeLimits = {
  maxEventBytes: 64 * 1024,
  maxRetainedBytes: 1024 * 1024,
  maxPartitions: 10,
  maxConnections: 10,
  maxPresenceMembers: 100,
};

const agentLimits: AgentStateLimits = {
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
