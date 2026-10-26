/** Invokes the tutorial pricing member directly to verify its ten-item discount independently of HTTP. */
import { expect, test } from "bun:test";
import { invokeFunction } from "@relkit/testing";
import orders from "@app/services/orders/service.js";

test("priceOrder is available without the HTTP route", async () => {
  expect(await invokeFunction(orders.priceOrder, { quantity: 10 })).toEqual({ totalCents: 900 });
});
