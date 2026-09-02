import { strict as assert } from "node:assert";
import createOrder from "@app/orders/functions/create-order.function.js";
import { receiptObjectName } from "@app/platform/receipt-object.js";

/** Keeps ordinary helper calls opaque to the explicit RelKit dependency surface. */
export function assertOrdinaryHelperIsOpaque(): void {
  assert.equal(receiptObjectName("order-123"), "order-123.json");
  assert.deepEqual(Object.keys(createOrder.dependencies ?? {}).sort(), ["cache"]);
  assert.equal(Object.hasOwn(createOrder, "ordinaryLibrary"), false);
}

assertOrdinaryHelperIsOpaque();
