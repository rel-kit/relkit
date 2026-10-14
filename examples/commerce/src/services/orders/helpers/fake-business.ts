/** Holds process-local demonstration orders used by export/cleanup tasks; mutations reset when this module reloads. */
const orders = new Map([
  ["order-1", { status: "paid", totalCents: 2_500 }],
  ["order-2", { status: "pending", totalCents: 4_000 }],
  ["order-3", { status: "cancelled", totalCents: 1_200 }],
]);

/** Projects requested demo orders to CSV, retaining missing IDs as explicit rows.
 * @param orderIds - Ordered IDs included in the export.
 * @returns CSV with the fixed header and one row per requested ID. */
export function exportOrderCsv(orderIds: readonly string[]): string {
  const rows = ["order_id,status,total_cents"];
  for (const orderId of orderIds) {
    const order = orders.get(orderId) ?? { status: "missing", totalCents: 0 };
    rows.push(`${orderId},${order.status},${order.totalCents}`);
  }
  return rows.join("\n");
}

/** Removes cancelled rows from the process-local demo map.
 * @param _before - Accepted tutorial cutoff; this fake deliberately uses status alone.
 * @returns The number of cancelled rows removed from this module instance. */
export function removeOrdersBefore(_before: string): number {
  let removed = 0;
  for (const [orderId, order] of orders) {
    if (order.status === "cancelled") {
      orders.delete(orderId);
      removed += 1;
    }
  }
  return removed;
}
