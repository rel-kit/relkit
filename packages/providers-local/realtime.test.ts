import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOperationId } from "@relkit/realtime";
import { createLocalRealtimeProvider } from "./src/index.ts";

test("local realtime persists receipts and discovers events through polling", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-realtime-"));
  try {
    const provider = createLocalRealtimeProvider(root, { pollingMs: 50 });
    const operationId = createOperationId();
    const first = await provider.append(eventRequest(operationId, "digest", "one"));
    expect(first.accepted).toBe(true);
    expect(first.duplicate).toBe(false);
    expect(
      await provider.lookupAppendReceipt({
        ...scope(first.providerEpoch),
        operationId,
        semanticDigest: "digest",
        receiptWindowMs: 86_400_000,
        now: new Date().toISOString(),
      }),
    ).toMatchObject({ status: "found" });
    expect((await provider.append(eventRequest(operationId, "digest", "one"))).duplicate).toBe(
      true,
    );
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        provider.append(
          eventRequest(undefined, undefined, `concurrent-${index}`, first.providerEpoch),
        ),
      ),
    );
    const checkpoint = (
      await provider.append(eventRequest(undefined, undefined, "checkpoint", first.providerEpoch))
    ).checkpoint;

    const controller = new AbortController();
    const waiting = provider.waitAfter({
      ...scope(first.providerEpoch),
      after: checkpoint,
      deadlineMs: Date.now() + 1_000,
      signal: controller.signal,
    });
    await Bun.sleep(75);
    await provider.append(eventRequest(undefined, undefined, "two", first.providerEpoch));
    await waiting;
    const page = await provider.readAfter({
      ...scope(first.providerEpoch),
      after: checkpoint,
      limit: 10,
      maxEncodedBytes: 64 * 1024,
    });
    expect(page.events.map((event) => event.payload)).toEqual([{ value: "two" }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("presence inspection is side-effect free and deduplicates members", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-presence-"));
  try {
    const provider = createLocalRealtimeProvider(root, { pollingMs: 50 });
    const request = {
      ...scope("initial"),
      leaseId: "lease-1",
      connectionId: "connection-1",
      opaqueMemberId: "opaque-member",
      memberInfo: { displayName: "Ada" },
      expiresAt: new Date(Date.now() + 45_000).toISOString(),
      maxMembers: 100,
      maxConnections: 100,
    };
    const acquired = await provider.acquirePresence(request);
    const before = await provider.readPresence(request);
    const after = await provider.readPresence(request);
    expect(before).toEqual(after);
    expect(acquired).toMatchObject({ connections: 1, memberCount: 1 });
    await provider.acquirePresence({
      ...request,
      leaseId: "lease-2",
      connectionId: "connection-2",
    });
    expect(await provider.readPresence(request)).toMatchObject({ connections: 2, memberCount: 1 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("presence and encoded event limits reject before changing provider state", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-realtime-limits-"));
  try {
    const provider = createLocalRealtimeProvider(root);
    const lease = {
      ...scope("initial"),
      leaseId: "lease-1",
      connectionId: "connection-1",
      expiresAt: new Date(Date.now() + 45_000).toISOString(),
      maxMembers: 100,
      maxConnections: 1,
    };
    await provider.acquirePresence(lease);
    await expect(
      provider.acquirePresence({ ...lease, leaseId: "lease-2", connectionId: "connection-2" }),
    ).rejects.toThrow("PRESENCE_CAPACITY_EXCEEDED");
    await provider.renewPresence({
      ...lease,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(await provider.readPresence(lease)).toMatchObject({ connections: 1 });

    const oversized = eventRequest(undefined, undefined, "x".repeat(65_536));
    await expect(provider.append(oversized)).rejects.toMatchObject({
      code: "REALTIME_EVENT_TOO_LARGE",
    });
    expect(
      (
        await provider.readAfter({
          ...scope("initial"),
          limit: 10,
          maxEncodedBytes: 64 * 1024,
        })
      ).events,
    ).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("expired events are omitted and reject expired checkpoints", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-realtime-expiry-"));
  try {
    const provider = createLocalRealtimeProvider(root);
    const receipt = await provider.append({
      ...eventRequest(undefined, undefined, "expired"),
      occurredAt: new Date(Date.now() - 1_000).toISOString(),
      retentionMs: 1,
    });

    expect(
      (
        await provider.readAfter({
          ...scope(receipt.providerEpoch),
          limit: 10,
          maxEncodedBytes: 64 * 1024,
        })
      ).events,
    ).toEqual([]);
    expect(
      await provider.readAfter({
        ...scope(receipt.providerEpoch),
        after: receipt.checkpoint,
        limit: 10,
        maxEncodedBytes: 64 * 1024,
      }),
    ).toMatchObject({ gap: "expired", events: [] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function scope(providerEpoch: string) {
  return {
    applicationId: "app",
    environment: "test",
    channelId: "orders",
    partition: "order-1",
    profile: "default",
    identityScope: "user-1",
    sessionEpoch: "session-1",
    policyEpoch: "policy-1",
    providerEpoch,
  };
}

function eventRequest(
  operationId: ReturnType<typeof createOperationId> | undefined,
  semanticDigest: string | undefined,
  value: string,
  providerEpoch = "initial",
) {
  return {
    ...scope(providerEpoch),
    ...(operationId === undefined ? {} : { operationId }),
    ...(semanticDigest === undefined ? {} : { semanticDigest }),
    event: "changed",
    payload: { value },
    encodedBytes: 64,
    occurredAt: new Date().toISOString(),
    receiptExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    retentionMs: 300_000,
    maxEvents: 100,
    limits: {
      maxEventBytes: 64 * 1024,
      maxRetainedBytes: 1024 * 1024,
      maxPartitions: 10,
      maxConnections: 10,
      maxPresenceMembers: 100,
    },
  };
}
