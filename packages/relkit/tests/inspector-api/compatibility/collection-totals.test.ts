/**
 * Every graph and runtime collection page states how many records match its filters, so a list
 * of 23 errors shown 20 at a time reads "20 of 23" rather than "20 shown" (IN-34). Event
 * deliveries pass through the total and per-state counts when the provider reports them.
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { API_BASE_PATH } from "relkit/contracts";
import { installInspectorEndpoints } from "../../../src/inspector-api/index.ts";
import { json } from "./contracts-fixtures.ts";
import { identity } from "./contracts-data.ts";

const errors = Array.from({ length: 23 }, (_, index) => ({
  kind: "error",
  id: `orders.error-${String(index).padStart(2, "0")}`,
  domainId: index < 3 ? "billing" : "orders",
}));

/**
 * Installs an Inspector over a graph with 23 errors, 23 runtime functions and an event provider.
 * @param events - Native event query answer.
 * @returns The installed router.
 */
function app(events: Record<string, unknown> = { deliveries: [] }): Hono {
  const router = new Hono();
  installInspectorEndpoints(router, {
    activeGeneration: {
      ...identity,
      graph: { contractVersion: 6, appId: "totals", nodes: errors, edges: [] },
      runtime: {
        functions: errors.map((error) => ({ id: error.id, status: "ready" })),
        events: { query: () => events },
      },
    },
  });
  return router;
}

describe("collection totals", () => {
  test("a graph page larger than its limit reports the total", async () => {
    const page = await json<{ items: unknown[]; nextCursor?: string; total?: number }>(
      app(),
      API_BASE_PATH + "/errors?limit=20",
    );
    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).toBe("20");
    expect(page.total).toBe(23);
  });

  test("the total counts the records matching the filters, not the whole collection", async () => {
    const page = await json<{ items: unknown[]; total?: number }>(
      app(),
      API_BASE_PATH + "/errors?domain=billing",
    );
    expect(page.items).toHaveLength(3);
    expect(page.total).toBe(3);
  });

  test("a runtime page reports its total", async () => {
    const page = await json<{ items: unknown[]; total?: number }>(
      app(),
      API_BASE_PATH + "/runtime/functions?limit=5&cursor=20",
    );
    expect(page.items).toHaveLength(3);
    expect(page.total).toBe(23);
  });

  test("event deliveries pass through a reported total and per-state counts", async () => {
    const page = await json<{ total?: number; counts?: Record<string, number> }>(
      app({
        deliveries: [],
        total: 140,
        counts: { pending: 1, completed: 120, "dead-lettered": 19, bogus: "x" },
      }),
      API_BASE_PATH + "/runtime/events?limit=100",
    );
    expect(page.total).toBe(140);
    expect(page.counts).toEqual({ pending: 1, completed: 120, "dead-lettered": 19 });
  });

  test("event deliveries without a reported total do not invent one", async () => {
    const page = await json<{ total?: number; counts?: Record<string, number> }>(
      app(),
      API_BASE_PATH + "/runtime/events",
    );
    expect(page.total).toBeUndefined();
    expect(page.counts).toBeUndefined();
  });
});
