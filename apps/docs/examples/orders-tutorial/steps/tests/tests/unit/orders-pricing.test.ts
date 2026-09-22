import { expect, test } from "bun:test";
import { invokeFunction } from "@relkit/testing";
import priceOrder from "../../src/orders/functions/price-order.function.js";

test("bulk pricing preserves the regular price below ten", async () => {
  expect(await invokeFunction(priceOrder, { quantity: 3 })).toEqual({ totalCents: 300 });
  expect(await invokeFunction(priceOrder, { quantity: 10 })).toEqual({ totalCents: 900 });
});
