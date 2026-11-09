/** Checks the migrated endpoints and the endpoints still served by the Hono app. */
import { afterAll, expect, test } from "bun:test";
import { resolve } from "node:path";
import { createTestApplication } from "@relkit/testing";
import config from "../relkit.config.js";

const testApp = await createTestApplication(config, {
  projectRoot: resolve(import.meta.dir, ".."),
});

afterAll(() => testApp.close());

test("POST /orders validates the body and answers 201", async () => {
  const response = await testApp.http.request("/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: "order-1", sku: "book", quantity: 3 }),
  });
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ orderId: "order-1", sku: "book", totalCents: 300 });

  const invalid = await testApp.http.request("/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: "order-2", sku: "book", quantity: 0 }),
  });
  expect(invalid.status).toBe(422);
});

test("GET /orders/:orderId returns the order or the declared 404", async () => {
  const found = await testApp.http.request("/orders/order-1");
  expect(found.status).toBe(200);
  expect(await found.json()).toEqual({
    orderId: "order-1",
    status: "confirmed",
    totalCents: 1_000,
  });
  expect((await testApp.http.request("/orders/missing")).status).toBe(404);
});

test("the Hono app still serves /legacy", async () => {
  const response = await testApp.http.request("/legacy/health");
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("ok");
  expect((await testApp.http.request("/legacy/orders/missing")).status).toBe(404);
});
