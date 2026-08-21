import { expect, test } from "bun:test";
import type { FunctionRequest } from "@zsys/contracts";
import { defineError, defineFunction } from "@zsys/functions";
import { z } from "@zsys/schema";
import { handleTestRequest } from "./src/application-http.ts";
import { createTestRuntime, type TestRuntime } from "./src/runtime.ts";
import type { TestRoute } from "./src/application-routes.ts";

test("maps inferred declared errors in the in-process HTTP harness", async () => {
  const unavailable = defineError({
    id: "orders.unavailable",
    data: z.object({ reason: z.string() }),
    message: "Order unavailable",
    retry: "later",
  });
  const target = defineFunction({
    id: "orders.read",
    input: z.object({}),
    output: z.object({ ok: z.boolean() }),
    errors: [unavailable],
    handler: async () => new unavailable({ reason: "sold out" }),
  });
  const route: TestRoute = {
    method: "GET",
    path: "/orders",
    request: { kind: "input", fields: {} },
    target,
    responses: [
      { kind: "success", status: 200 },
      { kind: "error", errorId: unavailable.id, status: 500 },
    ],
  };
  const runtime: TestRuntime = createTestRuntime();

  try {
    const response = await handleTestRequest(
      [route],
      runtime,
      new Request("http://zsys.test/orders"),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      code: unavailable.id,
      outcome: "declared-error",
      data: { reason: "sold out" },
    });
  } finally {
    await runtime.close();
  }
});

test("passes an immutable structured request through the in-process HTTP harness", async () => {
  let observed: FunctionRequest | undefined;
  const target = defineFunction({
    id: "orders.request",
    input: z.object({ value: z.string() }),
    output: z.object({ ok: z.boolean() }),
    handler: async (_input, request) => {
      if (request === undefined) throw new Error("Expected an HTTP request");
      observed = request;
      expect(await request.text()).toBe('{"value":"ready"}');
      return { ok: true };
    },
  });
  const route: TestRoute = {
    method: "POST",
    path: "/orders/:orderId/*parts",
    request: { kind: "input", fields: { value: { kind: "body", name: "value" } } },
    target,
    responses: [{ kind: "success", status: 200 }],
  };
  const runtime: TestRuntime = createTestRuntime();

  try {
    const response = await handleTestRequest(
      [route],
      runtime,
      new Request("http://zsys.test/orders/order-1/a/b?tag=red&tag=blue", {
        method: "POST",
        headers: { "x-tags": "one, two", "content-type": "application/json" },
        body: '{"value":"ready"}',
      }),
    );

    expect(response.status).toBe(200);
    expect(observed?.params).toEqual({ orderId: "order-1", parts: ["a", "b"] });
    expect(observed?.query).toEqual({ tag: ["red", "blue"] });
    expect(observed?.headers.getAll("x-tags")).toEqual(["one", "two"]);
    expect(observed?.headers.get("x-tags")).toBe("one, two");
    expect(observed?.metadata).toEqual({
      kind: "http",
      pathPattern: "/orders/:orderId/*parts",
    });
    expect(observed !== undefined && Object.isFrozen(observed)).toBe(true);
    expect(observed !== undefined && Object.isFrozen(observed.params)).toBe(true);
    expect(observed !== undefined && Object.isFrozen(observed.query)).toBe(true);
    expect(observed !== undefined && Object.isFrozen(observed.headers.values)).toBe(true);
  } finally {
    await runtime.close();
  }
});
