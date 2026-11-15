/** Drizzle service with one table. */
import { defineDrizzleService } from "@relkit/drizzle/sqlite";
import {
  integer,
  sqliteTable,
  text,
} from "../../../packages/drizzle/node_modules/drizzle-orm/sqlite-core/index.js";

export const orders = sqliteTable("orders", {
  id: text().primaryKey(),
  sku: text().notNull(),
  quantity: integer().notNull(),
  status: text({ enum: ["placed", "shipped", "refunded"] }).notNull(),
});

export default defineDrizzleService({ schema: { orders }, client: () => ({}) as never });
