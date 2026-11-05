/**
 * Writes an order and its `orders.created` event in one Drizzle transaction.
 * `outbox(tx).publish` stores the event and one delivery per consumer on the
 * same transaction, so consumers see the event only if the order commits, and
 * never see an event for an order that rolled back.
 */
import { drizzle } from "drizzle-orm/bun-sql/postgres";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { outbox } from "@relkit/postgres/drizzle";
import orderCreated from "../events/order-created.event.js";

export const orders = pgTable("orders", {
  id: text().primaryKey(),
  sku: text().notNull(),
  totalCents: integer().notNull(),
});

/**
 * Places an order and publishes its event atomically.
 * @param db - Drizzle database on the backend's Postgres database.
 * @param order - Order to place.
 * @returns The published event envelope.
 */
export async function placeOrder(
  db: ReturnType<typeof drizzle>,
  order: { readonly orderId: string; readonly sku: string; readonly totalCents: number },
) {
  return db.transaction(async (tx) => {
    await tx
      .insert(orders)
      .values({ id: order.orderId, sku: order.sku, totalCents: order.totalCents });
    return outbox(tx).publish(orderCreated, order, { key: order.orderId });
  });
}
