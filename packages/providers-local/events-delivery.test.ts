import { applicationFailure } from "@zsys/runtime-effect";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEventDelivery } from "./src/events/delivery.ts";

const roots: string[] = [];

describe("local durable event delivery", () => {
  test("retries with a durable cursor and exposes duplicate recovery", async () => {
    const root = await makeRoot();
    let now = 100;
    let first = true;
    const calls: string[] = [];
    const delivery = await createEventDelivery(
      join(root, "receipt"),
      {
        id: "orders.receipt",
        retry: {
          maxAttempts: 2,
          initialDelayMs: 10,
          maxDelayMs: 10,
          multiplier: 1,
          jitter: "none",
        },
        invoke: async (event) => {
          calls.push(event.instanceId);
          if (first) {
            first = false;
            throw applicationFailure({
              id: "orders.retryable",
              message: "try again",
              data: null,
              retry: "later",
            });
          }
          return event.instanceId;
        },
      },
      { now: () => now, ownerToken: "worker-a", leaseDurationMs: 5 },
    );

    await expect(delivery.deliver(envelope("event-1"))).resolves.toMatchObject({
      state: "delayed",
      status: "failed",
      attempt: 1,
      duplicate: false,
      failure: { retry: "later" },
    });
    expect(delivery.snapshot()).toMatchObject({
      cursor: 4,
      counts: { delayed: 1 },
      capabilities: { restartRecovery: true, exactlyOnce: false, orderedByKey: false },
    });

    now = 110;
    await expect(delivery.runNext()).resolves.toMatchObject({
      state: "completed",
      attempt: 2,
      duplicate: true,
      value: "event-1",
    });
    expect(calls).toEqual(["event-1", "event-1"]);
    await delivery.close();
  });

  test("recovers an acknowledgement gap and bounds one trigger", async () => {
    const root = await makeRoot();
    let now = 0;
    let rejectAck = true;
    const first = await createEventDelivery(
      join(root, "gap"),
      { id: "orders.gap", invoke: async () => "ok" },
      {
        now: () => now,
        ownerToken: "worker-a",
        leaseDurationMs: 5,
        onBoundary: (boundary) => {
          if (boundary === "handler-success-before-ack" && rejectAck) {
            rejectAck = false;
            throw new Error("ack gap");
          }
        },
      },
    );
    await expect(first.deliver(envelope("event-gap"))).rejects.toThrow("ack gap");
    await first.close();

    now = 5;
    const restarted = await createEventDelivery(
      join(root, "gap"),
      { id: "orders.gap", invoke: async () => "recovered" },
      { now: () => now, ownerToken: "worker-b", leaseDurationMs: 5, concurrency: 1 },
    );
    expect(restarted.snapshot().counts).toMatchObject({ available: 1, leased: 0 });
    await expect(restarted.runNext()).resolves.toMatchObject({
      state: "completed",
      attempt: 2,
      duplicate: true,
      value: "recovered",
    });
    await restarted.close();
  });

  test("keeps accepted overflow durable while honoring trigger concurrency", async () => {
    const root = await makeRoot();
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const firstStarted = new Promise<void>((resolve) => (started = resolve));
    let active = 0;
    let maximum = 0;
    const delivery = await createEventDelivery(
      join(root, "limited"),
      {
        id: "orders.limited",
        invoke: async (event) => {
          active += 1;
          maximum = Math.max(maximum, active);
          if (event.instanceId === "event-1") {
            started();
            await gate;
          }
          active -= 1;
          return event.instanceId;
        },
      },
      { concurrency: 1, now: () => 0 },
    );

    const running = delivery.deliver(envelope("event-1"));
    await firstStarted;
    await expect(delivery.deliver(envelope("event-2"))).resolves.toMatchObject({
      status: "queued",
      state: "available",
    });
    release();
    await expect(running).resolves.toMatchObject({ state: "completed" });
    await expect(delivery.runNext()).resolves.toMatchObject({
      state: "completed",
      value: "event-2",
    });
    expect(maximum).toBe(1);
    await delivery.close();
  });
});

function envelope(instanceId: string) {
  return {
    instanceId,
    eventId: "orders.created",
    version: 1,
    payload: { orderId: "order-1" },
    occurredAt: "2026-08-15T00:00:00.000Z",
    publishedAt: "2026-08-15T00:00:01.000Z",
    traceId: "trace-1",
    attributes: {},
  } as const;
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "zsys-event-delivery-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
