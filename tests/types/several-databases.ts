/** Checks that a function declaring two Drizzle services reaches each through `ctx.databases`
 * with that service's own models, and that the default service's context is the type the
 * generated registry gives `ctx.database`.
 */
import type { DatabaseContext } from "@relkit/drizzle";
import { defineDrizzleService } from "@relkit/drizzle/sqlite";
import { defineFunction } from "relkit/functions";
import { z } from "relkit/schema";
import {
  integer,
  sqliteTable,
  text,
} from "../../packages/drizzle/node_modules/drizzle-orm/sqlite-core/index.js";

const orders = sqliteTable("orders", { id: text().primaryKey(), totalCents: integer().notNull() });
const pageViews = sqliteTable("page_views", { id: text().primaryKey(), path: text().notNull() });

const main = defineDrizzleService({
  id: "types.several.main",
  default: true,
  schema: { orders },
  client: () => ({}) as never,
});
const analytics = defineDrizzleService({
  id: "types.several.analytics",
  schema: { pageViews },
  client: () => ({}) as never,
});

// @ts-expect-error default is a boolean
defineDrizzleService({ default: "yes", schema: { orders }, client: () => ({}) as never });

defineFunction({
  id: "types.several.record-order",
  input: z.object({ orderId: z.string() }),
  output: z.object({ ok: z.boolean() }),
  dependencies: { databases: { main, analytics } },
  handler: async ({ orderId }, ctx) => {
    await ctx.databases.main.orders.insert({ data: { id: orderId, totalCents: 100 } });
    await ctx.databases.analytics.pageViews.insert({ data: { id: orderId, path: "/orders" } });
    // @ts-expect-error the analytics service has no orders table
    await ctx.databases.analytics.orders.findMany();
    // @ts-expect-error the main service has no page views table
    await ctx.databases.main.pageViews.findMany();
    // @ts-expect-error only declared databases are available
    await ctx.databases.billing.invoices.findMany();
    // The generated registry types ctx.database as the default service's context.
    const database: DatabaseContext<typeof main> = ctx.databases.main;
    void database;
    return { ok: true };
  },
});
