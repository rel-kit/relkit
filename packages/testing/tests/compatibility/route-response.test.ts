/** Requires a route's `response` option to shape only its HTTP response, not the function. */
import { expect, test } from "bun:test";
import { defineFunction } from "relkit/functions";
import { defineRoute } from "relkit/routes";
import { z } from "relkit/schema";
import { handleTestRequest } from "../../src/application-http.ts";
import type { TestRoute } from "../../src/application-routes.ts";
import { createTestJob } from "../../src/index.ts";
import { createTestRuntime } from "../../src/runtime.ts";

const createOrder = defineFunction({
  id: "orders.create",
  input: z.object({ sku: z.string() }),
  output: z.object({ orderId: z.string() }),
  handler: async ({ sku }) => ({ orderId: `order-${sku}` }),
});

const POST = defineRoute({
  target: createOrder,
  response: (order) => ({
    status: 201,
    headers: { location: `/orders/${order.orderId}` },
    cookies: [{ name: "last-order", value: order.orderId, httpOnly: true }],
  }),
});

test("the route sets 201, Location and a cookie from the function's output", async () => {
  const route: TestRoute = {
    method: "POST",
    path: "/orders",
    request: { kind: "input", fields: { sku: { kind: "body", name: "sku" } } },
    target: createOrder,
    responses: [{ kind: "success", status: 200 }],
    ...(POST.response === undefined ? {} : { response: POST.response }),
  };
  const runtime = createTestRuntime();
  try {
    const response = await handleTestRequest(
      [route],
      runtime,
      new Request("http://relkit.test/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku: "a1" }),
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("location")).toBe("/orders/order-a1");
    expect(response.headers.get("set-cookie")).toBe("last-order=order-a1; HttpOnly");
    expect(await response.json()).toEqual({ orderId: "order-a1" });
  } finally {
    await runtime.close();
  }
});

test("the same function runs from a job and returns only its output", async () => {
  const job = await createTestJob({
    jobId: "orders.create-later",
    // The job harness types plain targets; a function descriptor is one at run time.
    target: createOrder as unknown as Parameters<typeof createTestJob>[0]["target"],
    retry: { maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: "none" },
  });
  try {
    await job.enqueue({ sku: "b2" });
    await expect(job.drain()).resolves.toMatchObject([
      { state: "completed", value: { orderId: "order-b2" } },
    ]);
  } finally {
    await job.close();
  }
});
