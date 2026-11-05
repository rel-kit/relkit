/**
 * The Durable Object realtime provider, run in Bun against `RelkitRealtimeState` with in-memory
 * storage: two providers of one profile share appended events, a waiter wakes on the other's
 * append, and concurrent appends all land. The same checks run against a real Durable Object in
 * workerd in `workers-conformance.test.ts`.
 */
import { expect, test } from "bun:test";
import { createOperationId } from "relkit/realtime";
import { durableObjectRealtime } from "../src/bindings.ts";
import {
  createDurableObjectRealtimeProvider,
  type DurableObjectNamespaceBinding,
} from "../src/runtime/realtime-durable-object.ts";
import { RelkitRealtimeState } from "../src/workers/index.ts";

/** @returns A namespace whose objects are `RelkitRealtimeState` instances with in-memory storage. */
function memoryNamespace(): DurableObjectNamespaceBinding {
  const objects = new Map<string, RelkitRealtimeState>();
  return {
    idFromName: (name) => name,
    get: (id) => {
      const key = String(id);
      let object = objects.get(key);
      if (object === undefined) {
        const values = new Map<string, unknown>();
        object = new RelkitRealtimeState(
          {
            storage: {
              get: async <Value>(name: string) => values.get(name) as Value | undefined,
              put: async (name, value) => void values.set(name, value),
            },
          },
          {},
        );
        objects.set(key, object);
      }
      const target = object;
      return { fetch: (input, init) => target.fetch(new Request(input, init)) };
    },
  };
}

test("two providers share a channel through one Durable Object", async () => {
  const namespace = memoryNamespace();
  const [reader, writer] = [0, 1].map(() =>
    createDurableObjectRealtimeProvider({ binding: "RELKIT_REALTIME", profile: "feed", namespace }),
  ) as [
    ReturnType<typeof createDurableObjectRealtimeProvider>,
    ReturnType<typeof createDurableObjectRealtimeProvider>,
  ];
  await Promise.all([reader.ready(), writer.ready()]);
  const scope = {
    applicationId: "do-test",
    environment: "test",
    profile: "feed",
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
  const event = (value: string) => ({
    ...scope,
    event: "changed",
    payload: { value },
    encodedBytes: 128,
    occurredAt: new Date().toISOString(),
    retentionMs: 300_000,
    maxEvents: 100,
    limits,
  });
  const initial = await reader.readAfter({ ...scope, limit: 1, maxEncodedBytes: 65_536 });
  const waiting = reader.waitAfter({
    ...scope,
    after: initial.checkpoint,
    deadlineMs: Date.now() + 5_000,
    signal: new AbortController().signal,
  });
  await writer.append({
    ...event("first"),
    operationId: createOperationId(),
    semanticDigest: "first",
    receiptExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  await waiting;
  const values = Array.from({ length: 10 }, (_, index) => `concurrent-${index}`);
  await Promise.all(
    values.map((value, index) => (index % 2 ? reader : writer).append(event(value))),
  );
  const page = await reader.readAfter({
    ...scope,
    after: initial.checkpoint,
    limit: 20,
    maxEncodedBytes: 65_536,
  });
  expect(page.events.map((item) => (item.payload as { value: string }).value).sort()).toEqual(
    ["first", ...values].sort(),
  );
  expect(reader.capabilities.durability).toBe("durable-object");
  await reader.close();
  await expect(reader.readAfter({ ...scope, limit: 1, maxEncodedBytes: 1_024 })).rejects.toThrow(
    "closed",
  );
});

test("authoring records the namespace binding", () => {
  const adapter = durableObjectRealtime({ binding: "RELKIT_REALTIME" });
  expect(adapter.adapterId).toBe("cloudflare-durable-object-realtime");
  expect(adapter.behavior.value).toEqual({ binding: "RELKIT_REALTIME" });
});
