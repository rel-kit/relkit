const orders = new Map([
  ["order-1", { status: "paid", totalCents: 2_500 }],
  ["order-2", { status: "pending", totalCents: 4_000 }],
  ["order-3", { status: "cancelled", totalCents: 1_200 }],
]);

export function exportOrderCsv(orderIds: readonly string[]): string {
  const rows = ["order_id,status,total_cents"];
  for (const orderId of orderIds) {
    const order = orders.get(orderId) ?? { status: "missing", totalCents: 0 };
    rows.push(`${orderId},${order.status},${order.totalCents}`);
  }
  return rows.join("\n");
}

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
