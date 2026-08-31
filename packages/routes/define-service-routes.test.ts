import { describe, expect, test } from "bun:test";
import { defineEvent } from "@relkit/events";
import { defineFunction } from "@relkit/functions";
import { z } from "@relkit/schema";
import { defineService } from "@relkit/services";
import { defineServiceRoutes, SERVICE_ROUTE_METHODS } from "./src/index.ts";

const target = defineFunction({
  id: "orders.create",
  input: z.object({}),
  output: z.object({ ok: z.boolean() }),
  handler: async () => ({ ok: true }),
});

const event = defineEvent({ id: "orders.created", version: 1, input: z.object({}) });
const orders = defineService({ functions: { create: target }, events: { created: event } });

describe("defineServiceRoutes", () => {
  test("creates immutable routes for every explicit HTTP method", () => {
    const entries = Object.fromEntries(SERVICE_ROUTE_METHODS.map((method) => [method, "create"]));
    const routes = defineServiceRoutes(orders, entries as never);

    expect(Object.keys(routes)).toEqual(SERVICE_ROUTE_METHODS);
    for (const route of Object.values(routes)) {
      expect(route.target).toBe(target);
      expect(Object.isFrozen(route)).toBe(true);
    }
    expect(Object.isFrozen(routes)).toBe(true);
  });

  test("forwards expanded function-route options", () => {
    const { POST } = defineServiceRoutes(orders, {
      POST: { member: "create", successStatus: 201, timeoutMs: 500 },
    });

    expect(POST.successStatus).toBe(201);
    expect(POST.timeoutMs).toBe(500);
    expect(POST.target).toBe(target);
  });

  test("rejects ALL, events, and non-public members", () => {
    expect(() => defineServiceRoutes(orders, { ALL: "create" } as never)).toThrow(
      "Invalid service route method",
    );
    expect(() => defineServiceRoutes(orders, { GET: "created" } as never)).toThrow(
      "not a public function",
    );
    expect(() => defineServiceRoutes(orders, { GET: "missing" } as never)).toThrow(
      "not a public function",
    );
  });
});
