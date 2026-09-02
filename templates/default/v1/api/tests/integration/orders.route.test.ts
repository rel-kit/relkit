import { afterAll, expect, test } from "bun:test";
import { createTestApplication } from "@relkit/testing";
import config from "../../relkit.config.js";

const testApp = await createTestApplication(config);

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
