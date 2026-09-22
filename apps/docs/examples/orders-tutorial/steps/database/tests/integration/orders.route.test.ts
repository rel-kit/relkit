import { afterAll, expect, test } from "bun:test";
import { createTestApplication } from "@relkit/testing";
import config from "../../relkit.config.js";
const app = await createTestApplication(config);
afterAll(() => app.close());
test("creates and reads an order", async () => {
  const created = await app.http.post("/orders", {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: "order-1", sku: "book", quantity: 3 }),
  });
  expect(created.status).toBe(201);
  expect(await created.json()).toEqual({
    orderId: "order-1",
    sku: "book",
    quantity: 3,
    totalCents: 300,
  });
  const read = await app.http.get("/orders/order-1");
  expect(read.status).toBe(200);
  expect(await read.json()).toEqual({
    found: true,
    order: { orderId: "order-1", sku: "book", quantity: 3, totalCents: 300 },
  });
});
