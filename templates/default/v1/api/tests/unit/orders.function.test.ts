import { expect, test } from "bun:test";
import { invokeFunction } from "@relkit/testing";
import orders from "@app/orders/service.js";

test("createOrder invokes pricing", async () => {
  const result = await invokeFunction(orders.createOrder, {
    orderId: "order-1",
    sku: "book",
    quantity: 3,
  });

  expect(result).toEqual({ orderId: "order-1", sku: "book", totalCents: 300 });
});
