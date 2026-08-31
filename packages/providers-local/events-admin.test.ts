import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applicationFailure } from "@relkit/runtime-effect";
import { createEventAdmin } from "./src/events/admin.ts";
import { createEventRouter } from "./src/events/router.ts";

const roots: string[] = [];

describe("local event admin contracts", () => {
  test("projects exact event and delivery state and safely retries a dead letter", async () => {
    const root = await mkdtemp(join(tmpdir(), "relkit-event-admin-"));
    roots.push(root);
    let attempts = 0;
    const replayed: boolean[] = [];
    const router = await createEventRouter(join(root, "events"), { now: () => 100 });
    await router.registerContract({
      kind: "event",
      id: "orders.created",
      version: 1,
      input: { type: "object" },
      source: { file: "events.ts", line: 1, column: 1 },
    });
    await router.registerTrigger({
      id: "orders.email",
      targetFunctionId: "send-email",
      eventId: "orders.created",
      eventVersion: 1,
      delivery: "durable",
      retry: { maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: "none" },
      invoke: async (_, context) => {
        replayed.push(context?.replayed ?? false);
        attempts += 1;
        if (attempts === 1)
          throw applicationFailure({ id: "email.failed", message: "failed", data: null });
        return "sent";
      },
    });

    const event = envelope("event-1");
    const failed = await router.route(event);
    expect(failed.deliveries[0]).toMatchObject({ state: "dead-lettered", status: "failed" });

    const admin = createEventAdmin(router, {
      mode: "test",
      now: () => 100,
      createActionId: () => "action-1",
    });
    const query = admin.query({ eventId: "orders.created", limit: 10 });
    expect(query).toMatchObject({
      protocol: "relkit.events.admin",
      version: 1,
      events: [{ id: "orders.created", version: 1 }],
      triggers: [{ id: "orders.email", eventId: "orders.created", eventVersion: 1 }],
      capabilities: [{ exactlyOnce: false, ordering: "unsupported" }],
      publications: [{ eventId: "orders.created", version: 1 }],
      deadLetters: [{ state: "dead-lettered" }],
    });
    expect(query.publications[0]).not.toHaveProperty("payload");

    const deliveryId = failed.deliveries[0].deliveryId;
    await expect(admin.retry({ deliveryId, reason: "inspect and retry" })).resolves.toMatchObject({
      action: "retry",
      status: { deliveryId, state: "available" },
      record: { actionId: "action-1", outcome: "applied", fromState: "dead-lettered" },
    });
    await expect(router.route(event)).resolves.toMatchObject({
      deliveries: [{ deliveryId, state: "completed", duplicate: true }],
    });
    expect(attempts).toBe(2);
    expect(replayed).toEqual([false, true]);
    await expect(admin.retry(deliveryId)).rejects.toMatchObject({
      code: "RELKIT_EVENT_ADMIN_STATE_INELIGIBLE",
    });
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
