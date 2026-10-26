/** Executes packed public Redis cache/realtime factories and one selected module without any agent SDK. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  generateRuntimeIntegrationImports,
  generateRuntimeIntegrationPlan,
  resolveRuntimeIntegrationPackages,
} from "@relkit/compiler";
import { assertRuntimeIntegrationModules } from "@relkit/engine";
import { createOperationId } from "@relkit/realtime";
import { redis, redisRealtime } from "@relkit/redis";
import { createRedisCacheProvider, createRedisRealtimeProvider } from "@relkit/redis/runtime";
import * as module from "@relkit/redis/runtime";

/** Uses real authoring metadata and compiler selection before the native provider calls. */
function verifySelectedModule(): void {
  const nodes = [redis(), redisRealtime()].map((adapter) => ({
    kind: "provider",
    id: `provider.${adapter.capability.id}.mixed`,
    capability: adapter.capability.id,
    adapter: {
      integrationId: adapter.integration.integrationId,
      adapterId: adapter.adapterId,
      protocolVersion: adapter.protocolVersion,
    },
  }));
  const graph = {
    nodes,
    edges: nodes.map((node) => ({ kind: "uses-provider-profile", to: node.id })),
  };
  const graphHash = `sha256:${createHash("sha256").update(JSON.stringify(graph)).digest("hex")}`;
  const packages = resolveRuntimeIntegrationPackages({
    projectRoot: process.cwd(),
    imports: ["@relkit/redis"],
  });
  assert.equal(packages.length, 1);
  const plan = generateRuntimeIntegrationPlan(graph, graphHash, packages);
  assert.deepEqual(plan.integrations.map((entry) => entry.capability).sort(), [
    "cache",
    "realtime",
  ]);
  const selected = packages[0];
  assert.ok(selected);
  const loaded = { ...selected, module };
  assertRuntimeIntegrationModules(plan, [loaded]);
  assert.throws(() => assertRuntimeIntegrationModules(plan, [loaded, loaded]), /duplicate module/);
  const imports = generateRuntimeIntegrationImports(plan);
  assert.equal(imports.match(/await import\("@relkit\/redis\/runtime"\)/g)?.length, 1);
}

/** Proves shared cache writes, atomic increments and deletion against the real Redis server. */
async function exerciseCache(url: string, profile: string): Promise<void> {
  const writer = createRedisCacheProvider({ url, cacheId: profile });
  const reader = createRedisCacheProvider({ url, cacheId: profile });
  try {
    assert.ok(writer.set);
    assert.ok(writer.get);
    assert.ok(writer.increment);
    assert.ok(writer.has);
    assert.ok(reader.get);
    assert.ok(reader.increment);
    assert.ok(reader.delete);
    await Promise.all([writer.ready(), reader.ready()]);
    await writer.set("order", { id: "packed-order", status: "queued" });
    assert.deepEqual(await reader.get("order"), { id: "packed-order", status: "queued" });
    assert.equal(await writer.increment("count", 2), 2);
    assert.equal(await reader.increment("count", 3), 5);
    assert.equal(await writer.get("count"), 5);
    await reader.delete("order");
    assert.equal(await writer.has("order"), false);
  } finally {
    await Promise.all([writer.close(), reader.close()]);
  }
}

/** Proves cross-client notification and idempotent committed replay with the native realtime provider. */
async function exerciseRealtime(url: string, profile: string): Promise<void> {
  const reader = createRedisRealtimeProvider({ url, profile });
  const writer = createRedisRealtimeProvider({ url, profile });
  const controller = new AbortController();
  let completion: Promise<PromiseSettledResult<void>[]> | undefined;
  let observation: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.all([reader.ready(), writer.ready()]);
    const scope = await realtimeScope(reader, profile);
    const initial = await reader.readAfter({ ...scope, limit: 1, maxEncodedBytes: 65_536 });
    let notified = false;
    const waiting = reader
      .waitAfter({
        ...scope,
        after: initial.checkpoint,
        deadlineMs: Date.now() + 30_000,
        signal: controller.signal,
      })
      .then(() => {
        notified = true;
      });
    completion = Promise.allSettled([waiting]);
    await writer.getEpoch();
    assert.equal(notified, false, "Realtime wait completed before any event was committed");
    const event = realtimeEvent(scope);
    const observationDeadline = Date.now() + 3_000;
    observation = setTimeout(
      () => controller.abort(new Error("Realtime notification exceeded 3 seconds")),
      3_000,
    );
    await writer.append(event);
    await waiting;
    assert.ok(
      !controller.signal.aborted && Date.now() < observationDeadline,
      "Realtime wait reached the earlier observation deadline",
    );
    await verifyReplay(reader, scope, event, initial);
  } finally {
    clearTimeout(observation);
    controller.abort();
    await completion;
    await Promise.all([reader.close(), writer.close()]);
  }
}

/** Replays the committed operation on the other client and proves its receipt prevents duplication. */
async function verifyReplay(
  reader: ReturnType<typeof createRedisRealtimeProvider>,
  scope: Awaited<ReturnType<typeof realtimeScope>>,
  event: ReturnType<typeof realtimeEvent>,
  initial: Awaited<ReturnType<typeof reader.readAfter>>,
): Promise<void> {
  await reader.append(event);
  const page = await reader.readAfter({
    ...scope,
    after: initial.checkpoint,
    limit: 10,
    maxEncodedBytes: 65_536,
  });
  assert.equal(page.events.length, 1);
  assert.deepEqual(page.events[0]?.payload, { status: "queued" });
}

/** Shares the same real provider epoch between both clients. */
async function realtimeScope(
  reader: ReturnType<typeof createRedisRealtimeProvider>,
  profile: string,
) {
  return {
    applicationId: "packed-mixed",
    environment: "test",
    profile,
    providerEpoch: await reader.getEpoch(),
    channelId: "orders",
    partition: "one",
    identityScope: "owner",
    sessionEpoch: "session",
    policyEpoch: "policy",
  };
}

/** Retains one operation identity and byte budget for the committed replay assertion. */
function realtimeEvent(scope: Awaited<ReturnType<typeof realtimeScope>>) {
  return {
    ...scope,
    operationId: createOperationId(),
    semanticDigest: "packed-mixed-event",
    event: "changed",
    payload: { status: "queued" },
    encodedBytes: 128,
    occurredAt: new Date().toISOString(),
    receiptExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    retentionMs: 300_000,
    maxEvents: 100,
    limits: {
      maxEventBytes: 65_536,
      maxRetainedBytes: 1_048_576,
      maxPartitions: 10,
      maxConnections: 10,
      maxPresenceMembers: 100,
    },
  };
}

const url = process.argv[2];
assert.ok(url, "An owned native Redis URL is required");
verifySelectedModule();
const profile = `packed-${crypto.randomUUID()}`;
await Promise.all([exerciseCache(url, profile), exerciseRealtime(url, profile)]);
process.stdout.write(
  JSON.stringify({
    cache: "passed",
    realtime: "passed",
    selectedCapabilities: ["cache", "realtime"],
    integrationModules: 1,
  }) + "\n",
);
