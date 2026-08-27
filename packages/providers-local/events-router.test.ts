import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEventRouter } from "./src/events/router.ts";

const roots: string[] = [];

describe("local event router", () => {
  test("matches compiled pairs and isolates durable fan-out failures", async () => {
    const root = await makeRoot();
    const calls: string[] = [];
    const router = await createEventRouter(join(root, "deliveries"), {
      now: () => 1_000,
      onBoundary: (boundary, triggerId) => {
        if (boundary === "record-fsynced" && triggerId === "orders.persist-fails") {
          throw new Error("injected delivery persistence failure");
        }
      },
    });
    await router.registerTrigger({
      id: "orders.ok",
      expansion: ["orders.created@1"],
      delivery: "durable",
      invoke: async () => {
        calls.push("ok");
      },
    });
    await router.registerTrigger({
      id: "orders.invoke-fails",
      expansion: ["orders.created@1"],
      delivery: "durable",
      invoke: async () => {
        calls.push("invoke-fails");
        throw new Error("listener failed");
      },
    });
    await router.registerTrigger({
      id: "orders.persist-fails",
      expansion: ["orders.created@1"],
      delivery: "durable",
      invoke: async () => {
        calls.push("persist-fails");
      },
    });
    await router.registerTrigger({
      id: "orders.other-version",
      expansion: ["orders.created@2"],
      delivery: "durable",
      invoke: async () => {
        calls.push("other-version");
      },
    });

    const result = await router.route({
      instanceId: "event-1",
      eventId: "orders.created",
      version: 1,
      payload: { orderId: "order-1" },
      occurredAt: "2026-08-15T00:00:00.000Z",
      publishedAt: "2026-08-15T00:00:01.000Z",
      traceId: "trace-1",
      attributes: {},
    });

    expect(result.matchedTriggerIds).toEqual([
      "orders.invoke-fails",
      "orders.ok",
      "orders.persist-fails",
    ]);
    expect(
      result.deliveries.map(({ triggerId, status, persisted }) => [triggerId, status, persisted]),
    ).toEqual([
      ["orders.invoke-fails", "failed", true],
      ["orders.ok", "completed", true],
      ["orders.persist-fails", "failed", false],
    ]);
    expect(calls.toSorted()).toEqual(["invoke-fails", "ok"]);
    expect(router.snapshot().records.map(({ triggerId }) => triggerId)).toEqual([
      "orders.invoke-fails",
      "orders.ok",
    ]);
    await router.close();
  });
});

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relkit-event-router-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
