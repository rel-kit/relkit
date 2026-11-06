// Redis conformance for one runtime: run by `bun` and by `node` against the same server. Plain
// JavaScript importing the built package, so the runtime picks its own native client. The cache and
// realtime providers run the published `@relkit/testing` suites, the same cases every provider runs.
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import {
  createRedisAgentStateProvider,
  createRedisCacheProvider,
  createRedisClient,
  createRedisRealtimeProvider,
} from "@relkit/redis/runtime";
import { assertConformance, runConformance } from "@relkit/testing/conformance";
import { createCacheConformanceHarness } from "@relkit/testing/cache-conformance";
import { createRealtimeConformanceHarness } from "@relkit/testing/realtime-conformance";
import { checkRedisProtocol } from "./redis-protocol-checks.mjs";
import { createOperationId } from "relkit/realtime";

const url = process.env.REDIS_URL;
assert.ok(url, "REDIS_URL is required");
const runtime =
  typeof process.versions.bun === "string"
    ? `bun ${process.versions.bun}`
    : `node ${process.versions.node}`;
const prefix = `conformance-${randomUUID()}`;

const runtimeApi = { createRedisClient, createRedisCacheProvider };
await checkRedisProtocol(runtimeApi, { url, prefix, unreachable: "redis://127.0.0.1:1" });
const unreachable = "redis://127.0.0.1:1";
const reports = [
  await runConformance(
    createCacheConformanceHarness({
      create: (cacheId) => createRedisCacheProvider({ url, cacheId }),
      failing: () =>
        createRedisCacheProvider({ url: unreachable, cacheId: prefix, connectionTimeoutMs: 500 }),
    }),
  ),
  await runConformance(
    createRealtimeConformanceHarness({
      create: (profile) => createRedisRealtimeProvider({ url, profile }),
      failing: () =>
        createRedisRealtimeProvider({
          url: unreachable,
          profile: prefix,
          connectionTimeoutMs: 500,
        }),
    }),
  ),
];
for (const report of reports) {
  assertConformance(report);
  const outcomes = report.results.map((result) => `${result.id}=${result.outcome}`);
  console.log(`${report.suite}: ${outcomes.join(" ")}`);
}
const profile = `${prefix}-shared`;
const [agentA, agentB] = [
  createRedisAgentStateProvider({ url, profile }),
  createRedisAgentStateProvider({ url, profile }),
];
await Promise.all([agentA.ready(), agentB.ready()]);
try {
  await agentState(agentA, agentB);
} finally {
  await Promise.all([agentA.close(), agentB.close()]);
}
console.log(`Redis conformance passed on ${runtime}`);

async function agentState(reader, writer) {
  const scope = {
    applicationId: "redis-conformance",
    environment: "test",
    profile,
    providerEpoch: await reader.getEpoch(),
    agentId: "assistant",
    ownerScope: "owner",
    authorizationGrantId: "grant",
    identityScope: "principal",
    sessionEpoch: "session",
  };
  const limits = {
    maxSnapshotBytes: 4_194_304,
    maxHistoryPageBytes: 4_194_304,
    maxJournalRecordBytes: 262_144,
    maxJournalBytesPerThread: 16_777_216,
    maxStateBytesPerApplication: 1_073_741_824,
    maxThreadsPerPrincipal: 100,
    maxActiveRunsPerPrincipal: 4,
    maxActiveRunsPerApplication: 100,
    terminalReserveBytes: 32_768,
    terminalReserveRecords: 4,
  };
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 86_400_000).toISOString();
  const thread = await reader.createThread({
    ...scope,
    operationId: createOperationId(),
    threadId: "conformance-thread",
    semanticDigest: "thread",
    now,
    limits,
  });
  const owner = {
    generationId: "generation-a",
    publicFingerprint: "fingerprint",
    protocolVersion: 1,
    schemaVersion: 1,
    providerScope: profile,
  };
  const run = await reader.acceptRun({
    ...scope,
    operationId: createOperationId(),
    semanticDigest: "run",
    threadId: thread.threadId,
    owner,
    input: { message: "hello" },
    inputDigest: "input",
    acceptedAt: now,
    receiptExpiresAt: expires,
    limits,
  });
  const target = { ...scope, threadId: thread.threadId, runId: run.runId };
  const waiting = reader.waitForControls({
    ...target,
    afterSequence: "0",
    deadlineMs: Date.now() + 5_000,
    signal: new AbortController().signal,
  });
  const operationId = createOperationId();
  await writer.acceptControl({
    ...target,
    operationId,
    semanticDigest: "stop",
    kind: "stop",
    publicPayload: null,
    acceptedAt: now,
    receiptExpiresAt: expires,
    limits: { maxQueuedPerRun: 32, maxQueuedPerApplication: 10_000 },
  });
  await waiting;
  const page = await reader.readControls({ ...target, afterSequence: "0", limit: 1 });
  assert.deepEqual(page.operationIds, [operationId]);
}
