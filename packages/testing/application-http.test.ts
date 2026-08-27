import { expect, test } from "bun:test";
import { defineError, defineFunction } from "@relkit/functions";
import { z } from "@relkit/schema";
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
      new Request("http://relkit.test/orders"),
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

test("maps HTTP data into function input without exposing the request", async () => {
  let observedInput: unknown;
  let observedContext: unknown;
  const target = defineFunction({
    id: "orders.request",
    input: z.object({ value: z.string() }),
    output: z.object({ ok: z.boolean() }),
    handler: async (input, context) => {
      observedInput = input;
      observedContext = context;
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
      new Request("http://relkit.test/orders/order-1/a/b?tag=red&tag=blue", {
        method: "POST",
        headers: { "x-tags": "one, two", "content-type": "application/json" },
        body: '{"value":"ready"}',
      }),
    );

    expect(response.status).toBe(200);
    expect(observedInput).toEqual({ value: "ready" });
    expect((observedContext as Record<string, unknown>).request).toBeUndefined();
  } finally {
    await runtime.close();
  }
});
