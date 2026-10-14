/** Checks export-orders.task through the supported public RELKIT APIs. */
import { expect, test } from "bun:test";
import task from "@app/services/orders/tasks/export-orders.task.js";

test("declares a typed export task", () => {
  expect(task.ref.id).toBe("orders.export-orders");
  expect(task.version).toBe("1");
});
