// Redis conformance for one runtime: run by `bun` and by `node` against the same server. Plain
// JavaScript importing the built package, so the runtime picks its own native client.
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import {
  createRedisAgentStateProvider,
  createRedisCacheProvider,
  createRedisClient,
  createRedisRealtimeProvider,
} from "@relkit/redis/runtime";
import { createOperationId } from "relkit/realtime";

const url = process.env.REDIS_URL;
assert.ok(url, "REDIS_URL is required");
const runtime =
  typeof process.versions.bun === "string"
    ? `bun ${process.versions.bun}`
    : `node ${process.versions.node}`;
const prefix = `conformance-${randomUUID()}`;

await protocol();
await cache();
const profile = `${prefix}-shared`;
const [realtimeA, realtimeB] = [
  createRedisRealtimeProvider({ url, profile }),
  createRedisRealtimeProvider({ url, profile }),
];
const [agentA, agentB] = [
  createRedisAgentStateProvider({ url, profile }),
  createRedisAgentStateProvider({ url, profile }),
];
await Promise.all([realtimeA.ready(), realtimeB.ready(), agentA.ready(), agentB.ready()]);
try {
  await realtime(realtimeA, realtimeB);
  await agentState(agentA, agentB);
} finally {
  await Promise.all([realtimeA.close(), realtimeB.close(), agentA.close(), agentB.close()]);
}
console.log(`Redis conformance passed on ${runtime}`);

async function protocol() {
  const client = createRedisClient({ url, connectionTimeoutMs: 2_000 });
  assert.equal(client.connected, false);
  await client.connect();
  assert.equal(client.connected, true);
  try {
    assert.equal(await client.ping(), true);
    const key = `${prefix}:protocol`;
    assert.equal(await client.get(key), null);
    await client.set(key, "one");
    assert.equal(await client.get(key), "one");
    assert.equal(await client.has(key), true);
    assert.equal(await client.type(key), "string");
    assert.equal(await client.ttl(key), -1);
    await client.set(key, "two", 60_000);
    const ttl = await client.ttl(key);
    assert.ok(ttl > 0 && ttl <= 60_000, `PTTL ${ttl}`);
    assert.equal(await client.increment(`${prefix}:counter`, 5), 5);
    assert.equal(await client.increment(`${prefix}:counter`), 6);
    const [cursor, keys] = await client.scan("0", `${prefix}:*`, 100);
    assert.equal(typeof cursor, "string");
    assert.ok(keys.length > 0 && keys.every((name) => name.startsWith(prefix)));
    assert.equal(await client.delete(key), 1);
    assert.equal(await client.has(key), false);
    assert.equal(await client.command("ECHO", ["raw"]), "raw");
    await assert.rejects(client.command("NOT-A-COMMAND", []));
    assert.equal(await client.ping(), true);
  } finally {
    client.close();
  }
  assert.equal(client.connected, false);
  await assert.rejects(client.connect(), /closed/);
  const unreachable = createRedisClient({ url: "redis://127.0.0.1:1", connectionTimeoutMs: 500 });
  await assert.rejects(unreachable.connect());
  unreachable.close();
}

async function cache() {
  const provider = createRedisCacheProvider({ url, cacheId: `${prefix}-cache` });
  await provider.ready();
  try {
    const key = { sku: "sku-1", region: "eu" };
    await provider.set(key, 2);
    assert.equal(await provider.get({ region: "eu", sku: "sku-1" }), 2);
    assert.equal(await provider.has(key), true);
    assert.equal(await provider.increment(key, 3), 5);
    await provider.delete(key);
    assert.equal(await provider.get(key), undefined);
    await provider.set(key, { nested: [1, 2] }, { ttlMs: 50 });
    assert.deepEqual(await provider.get(key), { nested: [1, 2] });
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(await provider.get(key), undefined);
  } finally {
    await provider.close();
  }
}

async function realtime(reader, writer) {
  const scope = {
    applicationId: "redis-conformance",
    environment: "test",
    profile,
    providerEpoch: await reader.getEpoch(),
    channelId: "orders",
    partition: "one",
    identityScope: "owner",
    sessionEpoch: "session",
    policyEpoch: "policy",
  };
  const limits = {
    maxEventBytes: 65_536,
    maxRetainedBytes: 1_048_576,
    maxPartitions: 10,
    maxConnections: 10,
    maxPresenceMembers: 100,
  };
  const initial = await reader.readAfter({ ...scope, limit: 1, maxEncodedBytes: 65_536 });
  const waiting = reader.waitAfter({
    ...scope,
    after: initial.checkpoint,
    deadlineMs: Date.now() + 5_000,
    signal: new AbortController().signal,
  });
  const event = (payload) => ({
    ...scope,
    event: "changed",
    payload,
    encodedBytes: 128,
    occurredAt: new Date().toISOString(),
    retentionMs: 300_000,
    maxEvents: 100,
    limits,
  });
  await writer.append({
    ...event({ ok: true }),
    operationId: createOperationId(),
    semanticDigest: "shared-event",
    receiptExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  await waiting;
  const page = await reader.readAfter({
    ...scope,
    after: initial.checkpoint,
    limit: 1,
    maxEncodedBytes: 65_536,
  });
  assert.equal(page.events.length, 1);
  const values = Array.from({ length: 20 }, (_, index) => `concurrent-${index}`);
  await Promise.all(
    values.map((value, index) => (index % 2 === 0 ? reader : writer).append(event({ value }))),
  );
  const next = await reader.readAfter({
    ...scope,
    after: page.checkpoint,
    limit: values.length,
    maxEncodedBytes: 65_536,
  });
  assert.deepEqual(next.events.map((item) => item.payload.value).sort(), [...values].sort());
}

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
