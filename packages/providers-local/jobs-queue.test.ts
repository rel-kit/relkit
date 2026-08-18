import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJobQueue } from "./src/jobs/queue.ts";
import { createJobStore } from "./src/jobs/store.ts";

const roots: string[] = [];

describe("local durable job queue", () => {
  test("keeps the six states, counts transitions, and selects in acceptance order", async () => {
    const { queue, close } = await makeQueue();
    await queue.enqueue({ instanceId: "job-1", input: { value: 1 } });
    await queue.enqueue({ instanceId: "job-2", input: { value: 2 } });
    await queue.enqueue({ instanceId: "job-3", input: { value: 3 } });
    await queue.transition("job-1", "available");
    await queue.transition("job-2", "available");
    await queue.transition("job-3", "available");

    expect(queue.selectAvailable(2).map((job) => job.instanceId)).toEqual(["job-1", "job-2"]);
    await queue.transition("job-1", "leased", { leaseExpiresAt: 200, attempt: 1 });
    await queue.transition("job-1", "completed");
    await queue.transition("job-2", "leased", { leaseExpiresAt: 200, attempt: 1 });
    await queue.transition("job-2", "dead-lettered");
    await queue.transition("job-3", "leased", { leaseExpiresAt: 200, attempt: 1 });
    await queue.transition("job-3", "delayed", { availableAt: 300, attempt: 1 });

    expect(queue.counts()).toEqual({
      accepted: 0,
      available: 0,
      leased: 0,
      delayed: 1,
      completed: 1,
      "dead-lettered": 1,
    });
    await close();
  });

  test("recovers accepted and expired leased work without inventing a state", async () => {
    const { queue, store, close } = await makeQueue();
    await queue.enqueue({ instanceId: "job-accepted", input: null });
    await queue.enqueue({ instanceId: "job-leased", input: null });
    await queue.transition("job-leased", "available");
    await queue.transition("job-leased", "leased", { leaseExpiresAt: 100, attempt: 1 });
    await queue.enqueue({ instanceId: "job-delayed", input: null });
    await queue.transition("job-delayed", "available");
    await queue.transition("job-delayed", "leased", { leaseExpiresAt: 500, attempt: 1 });
    await queue.transition("job-delayed", "delayed", { availableAt: 200, attempt: 1 });

    const recovered = await queue.recover(150);
    expect(recovered.map((job) => job.instanceId)).toEqual(["job-accepted", "job-leased"]);
    expect(queue.get("job-accepted")?.state).toBe("available");
    expect(queue.get("job-leased")?.state).toBe("available");
    expect(queue.get("job-delayed")?.state).toBe("delayed");
    expect(Object.keys(queue.counts()).sort()).toEqual([
      "accepted",
      "available",
      "completed",
      "dead-lettered",
      "delayed",
      "leased",
    ]);

    await queue.recover(250);
    await close();
    await store.close();
    const reopened = createJobQueue(await createJobStore(store.root), { now: () => 250 });
    expect(reopened.snapshot().map((job) => [job.instanceId, job.state])).toEqual([
      ["job-accepted", "available"],
      ["job-leased", "available"],
      ["job-delayed", "delayed"],
    ]);
  });

  test("does not publish a transition in memory before durable append acknowledgement", async () => {
    const root = await mkdtemp(join(tmpdir(), "zsys-queue-"));
    roots.push(root);
    const initial = await createJobStore(join(root, "jobs"));
    const first = createJobQueue(initial, { now: () => 50 });
    await first.enqueue({ instanceId: "job-1", input: true });
    await first.transition("job-1", "available");
    await initial.close();

    const store = await createJobStore(join(root, "jobs"), {
      onBoundary: (boundary) => {
        if (boundary === "record-fsynced") throw new Error("append acknowledgement failed");
      },
    });
    const queue = createJobQueue(store, { now: () => 50 });
    await expect(
      queue.transition("job-1", "leased", { leaseExpiresAt: 100, attempt: 1 }),
    ).rejects.toThrow("append acknowledgement failed");
    expect(queue.get("job-1")?.state).toBe("available");
    await store.close();

    const recoveredStore = await createJobStore(join(root, "jobs"));
    const recoveredQueue = createJobQueue(recoveredStore);
    await recoveredQueue.ready();
    expect(recoveredQueue.get("job-1")?.state).toBe("available");
    await recoveredStore.close();
  });

  test("acquires, renews, and recovers leases with process ownership", async () => {
    const root = await mkdtemp(join(tmpdir(), "zsys-lease-"));
    roots.push(root);
    let now = 100;
    const store = await createJobStore(join(root, "jobs"), { now: () => now });
    const worker = createJobQueue(store, {
      now: () => now,
      ownerToken: "worker-a",
      leaseDurationMs: 50,
    });
    await worker.enqueue({ instanceId: "job-1", input: null });
    await worker.transition("job-1", "available");

    const leased = await worker.acquire("job-1");
    expect(leased).toMatchObject({
      state: "leased",
      leaseOwner: "worker-a",
      leaseExpiresAt: 150,
      attempt: 1,
    });
    now = 120;
    expect(await worker.renew("job-1", { leaseDurationMs: 40 })).toMatchObject({
      leaseOwner: "worker-a",
      leaseExpiresAt: 160,
    });

    const other = createJobQueue(store, { now: () => now, ownerToken: "worker-b" });
    await other.ready();
    await expect(other.renew("job-1")).rejects.toThrow("another process");
    await store.close();

    now = 200;
    const restartedStore = await createJobStore(join(root, "jobs"));
    const restarted = createJobQueue(restartedStore, {
      now: () => now,
      ownerToken: "worker-b",
      leaseDurationMs: 50,
    });
    await restarted.ready();
    expect(restarted.get("job-1")).toMatchObject({ state: "available" });
    expect((await restarted.acquire("job-1"))?.leaseOwner).toBe("worker-b");
    await restartedStore.close();
  });
});

async function makeQueue(): Promise<{
  readonly queue: ReturnType<typeof createJobQueue>;
  readonly store: Awaited<ReturnType<typeof createJobStore>>;
  readonly close: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "zsys-queue-"));
  roots.push(root);
  const store = await createJobStore(join(root, "jobs"), { now: () => 0 });
  const queue = createJobQueue(store, { now: () => 50 });
  return { queue, store, close: () => store.close() };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
