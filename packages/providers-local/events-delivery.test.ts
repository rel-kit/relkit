import { applicationFailure } from "@relkit/runtime-effect";
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
              afterMs: 25,
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
      failure: { retry: "later", afterMs: 25 },
    });
    expect(delivery.snapshot()).toMatchObject({
      cursor: 4,
      counts: { delayed: 1 },
      capabilities: { restartRecovery: true, exactlyOnce: false, orderedByKey: false },
    });

    now = 124;
    await expect(delivery.runNext()).resolves.toBeUndefined();
    now = 125;
    await expect(delivery.runNext()).resolves.toMatchObject({
      state: "completed",
      attempt: 2,
      duplicate: true,
      value: "event-1",
    });
    expect(calls).toEqual(["event-1", "event-1"]);
    await delivery.close();
  });

  test("stops on an omitted retry declaration even when attempts remain", async () => {
    const root = await makeRoot();
    let calls = 0;
    const delivery = await createEventDelivery(
      join(root, "non-retryable"),
      {
        id: "orders.invalid",
        retry: {
          maxAttempts: 3,
          initialDelayMs: 10,
          maxDelayMs: 10,
          multiplier: 1,
          jitter: "none",
        },
        invoke: async () => {
          calls += 1;
          throw applicationFailure({
            id: "orders.invalid",
            message: "Invalid order",
            data: null,
          });
        },
      },
      { now: () => 0 },
    );

    await expect(delivery.deliver(envelope("event-invalid"))).resolves.toMatchObject({
      state: "dead-lettered",
      attempt: 1,
      failure: { retry: "never" },
    });
    await expect(delivery.runNext()).resolves.toBeUndefined();
    expect(calls).toBe(1);
    await delivery.close();
  });

  test("uses the policy clock for legacy retryable failures without a hint", async () => {
    const root = await makeRoot();
    let now = 100;
    let calls = 0;
    const delivery = await createEventDelivery(
      join(root, "legacy-retry"),
      {
        id: "orders.busy",
        retry: {
          maxAttempts: 2,
          initialDelayMs: 10,
          maxDelayMs: 10,
          multiplier: 1,
          jitter: "none",
        },
        invoke: async () => {
          calls += 1;
          throw applicationFailure({
            id: "orders.busy",
            message: "Try again",
            data: null,
            retry: "later",
          });
        },
      },
      { now: () => now },
    );

    const delayed = await delivery.deliver(envelope("event-legacy-retry"));
    expect(delayed).toMatchObject({ state: "delayed", attempt: 1, failure: { retry: "later" } });
    expect(delayed.failure).toEqual({
      kind: "application",
      outcome: "declared-error",
      code: "orders.busy",
      message: "Try again",
      data: null,
      retry: "later",
    });

    now = 109;
    await expect(delivery.runNext()).resolves.toBeUndefined();
    now = 110;
    await expect(delivery.runNext()).resolves.toMatchObject({
      state: "dead-lettered",
      attempt: 2,
      failure: { retry: "later" },
    });
    expect(calls).toBe(2);
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
  const root = await mkdtemp(join(tmpdir(), "relkit-event-delivery-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
