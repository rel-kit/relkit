/** Runs the Effect handler from "Write functions with Effect" through the public test API. */
import { expect, test } from "bun:test";
import { invokeFunction } from "@relkit/testing";
import getOrder from "./get-order.function.js";

test("returns the order the Effect finds", async () => {
  expect(await invokeFunction(getOrder, { orderId: "order-1" })).toEqual({
    id: "order-1",
    total: 42,
  });
});

test("rejects with the declared error the Effect fails with", async () => {
  await expect(invokeFunction(getOrder, { orderId: "order-2" })).rejects.toMatchObject({
    id: "orders.order-not-found",
    data: { orderId: "order-2" },
  });
});
