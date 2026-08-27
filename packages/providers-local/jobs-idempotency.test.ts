import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJobQueue } from "./src/jobs/queue.ts";
import { createJobStore } from "./src/jobs/store.ts";

const roots: string[] = [];

describe("local job idempotency", () => {
  test("extracts a validated key and returns duplicate acceptance metadata", async () => {
    const { queue, store } = await makeQueue(100);
    const first = await queue.enqueue({ input: { orderId: " order-1 " } });
    const duplicate = await queue.enqueue({
      instanceId: "job-2",
      input: { orderId: "order-1" },
      acceptedAt: 110,
    });

    expect(first).toMatchObject({
      instanceId: expect.any(String),
      accepted: true,
      duplicate: false,
      idempotencyKey: "order-1",
      idempotencyExpiresAt: 150,
    });
    expect(duplicate).toMatchObject({
      instanceId: first.instanceId,
      accepted: true,
      duplicate: true,
      idempotencyKey: "order-1",
      idempotencyExpiresAt: 150,
    });
    expect(queue.counts().accepted).toBe(1);
    expect(store.snapshot().records).toHaveLength(1);
    await store.close();
  });

  test("rejects missing or non-text keys before durable acceptance", async () => {
    const { queue, store } = await makeQueue(100);
    await expect(queue.enqueue({ input: { orderId: "" } })).rejects.toThrow(
      "must be non-empty text",
    );
    await expect(queue.enqueue({ input: { customerId: "customer-1" } })).rejects.toThrow("missing");
    expect(store.snapshot().records).toHaveLength(0);
    await store.close();
  });

  test("retains idempotency across restart and accepts the key after expiry", async () => {
    const root = await makeRoot();
    let now = 100;
    const firstStore = await createJobStore(root, { now: () => now });
    const firstQueue = createJobQueue(firstStore, {
      now: () => now,
      idempotency: { key: "orderId", retentionMs: 50 },
      createInstanceId: () => "job-1",
    });
    await firstQueue.ready();
    await firstQueue.enqueue({ input: { orderId: "order-1" } });
    await firstStore.close();

    now = 120;
    const retainedStore = await createJobStore(root, { now: () => now });
    const retainedQueue = createJobQueue(retainedStore, {
      now: () => now,
      idempotency: { key: "orderId", retentionMs: 50 },
      createInstanceId: () => "job-2",
    });
    await retainedQueue.ready();
    await expect(retainedQueue.enqueue({ input: { orderId: "order-1" } })).resolves.toMatchObject({
      instanceId: "job-1",
      duplicate: true,
    });
    await retainedStore.close();

    now = 151;
    const expiredStore = await createJobStore(root, { now: () => now });
    const expiredQueue = createJobQueue(expiredStore, {
      now: () => now,
      idempotency: { key: "orderId", retentionMs: 50 },
      createInstanceId: () => "job-2",
    });
    await expiredQueue.ready();
    await expect(expiredQueue.enqueue({ input: { orderId: "order-1" } })).resolves.toMatchObject({
      instanceId: "job-2",
      duplicate: false,
      idempotencyExpiresAt: 201,
    });
    expect(expiredQueue.counts()).toMatchObject({ accepted: 1, available: 1 });
    await expiredStore.close();
  });
});

async function makeQueue(now: number): Promise<{
  readonly queue: ReturnType<typeof createJobQueue>;
  readonly store: Awaited<ReturnType<typeof createJobStore>>;
}> {
  const root = await makeRoot();
  const store = await createJobStore(root, { now: () => now });
  const queue = createJobQueue(store, {
    now: () => now,
    idempotency: { key: "orderId", retentionMs: 50 },
    createInstanceId: () => `job-${now}`,
  });
  await queue.ready();
  return { queue, store };
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relkit-idempotency-"));
  roots.push(root);
  return join(root, "jobs");
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
