import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEphemeralDelivery } from "./src/events/ephemeral.ts";
import { createEventRouter } from "./src/events/router.ts";

const roots: string[] = [];

describe("local ephemeral event delivery", () => {
  test("reports bounded in-process counters", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const delivery = createEphemeralDelivery(async () => gate, 1);
    const first = delivery.deliver(envelope("event-1"));
    await delivery.deliver(envelope("event-2"));

    expect(delivery.snapshot()).toEqual({
      capacity: 1,
      inFlight: 1,
      admitted: 1,
      completed: 0,
      failed: 0,
      dropped: 1,
      persistence: "none",
      restartRecovery: false,
      dropPolicy: "drop-newest",
    });
    release();
    await first;
    expect(delivery.snapshot()).toMatchObject({ inFlight: 0, completed: 1, dropped: 1 });
    expect(() => createEphemeralDelivery(async () => undefined, 0)).toThrow(
      "capacity must be a positive integer",
    );
  });

  test("drops newest overflow and never persists or claims recovery", async () => {
    const root = await mkdtemp(join(tmpdir(), "relkit-event-ephemeral-"));
    roots.push(root);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: string[] = [];
    const router = await createEventRouter(join(root, "deliveries"), {
      ephemeralCapacity: 1,
    });
    await router.registerTrigger({
      id: "telemetry.events",
      eventId: "orders.created",
      eventVersion: 1,
      delivery: "ephemeral",
      invoke: async (envelope) => {
        calls.push(envelope.instanceId);
        await gate;
        return envelope.instanceId;
      },
    });

    const first = router.route(envelope("event-1"));
    expect(calls).toEqual(["event-1"]);
    const overflow = await router.route(envelope("event-2"));
    expect(overflow.deliveries[0]).toMatchObject({
      accepted: false,
      persisted: false,
      status: "dropped",
      capacity: 1,
      dropPolicy: "drop-newest",
      restartRecovery: false,
      dropReason: "capacity",
    });
    expect(calls).toEqual(["event-1"]);

    release();
    expect((await first).deliveries[0]).toMatchObject({
      accepted: true,
      persisted: false,
      status: "completed",
      capacity: 1,
      restartRecovery: false,
      value: "event-1",
    });
    expect(router.snapshot().records).toEqual([]);
    expect(existsSync(join(root, "deliveries"))).toBe(false);
    await router.close();
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

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
