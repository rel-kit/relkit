import { afterAll, expect, test } from "bun:test";
import { createTestApplication } from "@zsys/testing";
import app from "../../src/app.js";

const testApp = await createTestApplication(app);
testApp.fakes.setClient("events", "orderCreated", {
  publish: async () => ({ accepted: true, instanceId: "event-1" }),
});

test("POST /orders", async () => {
  const response = await testApp.http.request("/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: "order-1", sku: "book", quantity: 3 }),
  });
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({
    orderId: "order-1",
    sku: "book",
    totalCents: 300,
  });
});

afterAll(() => testApp.close());
