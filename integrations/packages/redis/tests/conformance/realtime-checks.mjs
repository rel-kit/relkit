// Realtime checks shared by the Redis socket conformance runner and the Workers conformance Worker,
// which runs them against the Durable Object realtime provider inside workerd.
import { strict as assert } from "node:assert";
import { createOperationId } from "relkit/realtime";

/**
 * Checks a realtime provider pair sharing one profile: a waiter wakes on the other's append, pages
 * read after a checkpoint, and concurrent appends from both all land.
 * @param reader - Provider that reads and waits.
 * @param writer - Provider that appends.
 * @param profile - Shared profile.
 * @param applicationId - Application identity in the scope.
 */
export async function checkRealtime(reader, writer, profile, applicationId) {
  const scope = {
    applicationId,
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
