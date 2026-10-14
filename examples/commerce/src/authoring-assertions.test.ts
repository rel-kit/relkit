/** Checks that ordinary receipt helpers remain outside createOrder's explicitly declared RELKIT dependency surface. */
import { strict as assert } from "node:assert";
import createOrder from "./services/orders/functions/create-order.function.js";
import { receiptObjectName } from "@app/platform/receipt-object.js";

/** Keeps ordinary helper calls outside the explicit RELKIT dependency surface.
 * @returns After helper output and declared dependency assertions pass. */
export function assertOrdinaryHelperIsOpaque(): void {
  assert.equal(receiptObjectName("order-123"), "order-123.json");
  assert.deepEqual(Object.keys(createOrder.dependencies ?? {}).sort(), ["cache"]);
  assert.equal(Object.hasOwn(createOrder, "ordinaryLibrary"), false);
}

assertOrdinaryHelperIsOpaque();
