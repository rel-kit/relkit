import type { Database } from "bun:sqlite";

export type OrderStatus = "pending" | "paid" | "shipped" | "cancelled";
const statuses = new Set<OrderStatus>(["pending", "paid", "shipped", "cancelled"]);

export function setOrderStatus(db: Database, orderId: string, status: OrderStatus): void {
  if (!orderId.trim() || !statuses.has(status)) throw new TypeError("Invalid order status");
  db.query("INSERT INTO order_status (order_id, status) VALUES (?, ?) ON CONFLICT(order_id) DO UPDATE SET status = excluded.status").run(orderId, status);
}

export function getOrderStatus(db: Database, orderId: string): OrderStatus | null {
  const row = db.query("SELECT status FROM order_status WHERE order_id = ?").get(orderId) as { status: OrderStatus } | null;
  return row?.status ?? null;
}
