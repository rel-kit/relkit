import { expect, test } from "bun:test";
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
