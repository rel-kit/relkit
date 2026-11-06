/** Checks that `dependencies` declares functions, events, channels and databases once and that
 * handlers reach each through the matching typed `ctx` client.
 */
import { defineDrizzleService } from "@relkit/drizzle/sqlite";
import { defineCache } from "relkit/cache";
import { defineEvent } from "relkit/events";
import { defineFunction } from "relkit/functions";
import { defineChannel } from "relkit/realtime";
import { z } from "relkit/schema";
import {
  integer,
  sqliteTable,
  text,
} from "../../packages/drizzle/node_modules/drizzle-orm/sqlite-core/index.js";

const priceOrder = defineFunction({
  id: "types.deps.price-order",
  input: z.object({ quantity: z.number() }),
  output: z.object({ totalCents: z.number() }),
  handler: async ({ quantity }) => ({ totalCents: quantity * 100 }),
});
const orderCreated = defineEvent({
  id: "types.deps.order-created",
  version: 1,
  input: z.object({ orderId: z.string() }),
});
const orderUpdates = defineChannel({
  id: "types.deps.order-updates",
  params: z.object({ orderId: z.string() }),
  events: { changed: z.object({ status: z.string() }) },
  client: { public: true },
  presence: "count",
});
const prices = defineCache({
  id: "types.deps.prices",
  key: z.string(),
  value: z.number(),
});
const orders = sqliteTable("orders", {
  id: text().primaryKey(),
  totalCents: integer().notNull(),
});
const analytics = defineDrizzleService({
  id: "types.deps.analytics",
  schema: { orders },
  client: () => ({}) as never,
});

defineFunction({
  id: "types.deps.create-order",
  input: z.object({ orderId: z.string(), quantity: z.number() }),
  output: z.object({ totalCents: z.number() }),
  dependencies: {
    functions: { priceOrder },
    events: { orderCreated },
    channels: { orderUpdates },
    databases: { analytics },
  },
  handler: async ({ orderId, quantity }, ctx) => {
    const { totalCents }: { totalCents: number } = await ctx.functions.priceOrder({ quantity });
    // @ts-expect-error function input is inferred from its schema
    await ctx.functions.priceOrder({ quantity: "two" });
    // @ts-expect-error only declared functions are available
    await ctx.functions.refundOrder({ orderId });

    await ctx.events.orderCreated.publish({ orderId });
    // @ts-expect-error event payload is inferred from its schema
    await ctx.events.orderCreated.publish({ order: orderId });

    await ctx.channels.orderUpdates.trigger({ orderId }, "changed", { status: "paid" });
    // @ts-expect-error channel event names come from the channel
    await ctx.channels.orderUpdates.trigger({ orderId }, "deleted", { status: "paid" });
    const presence = await ctx.channels.orderUpdates.getPresence({ orderId });
    void presence.connections;

    await ctx.databases.analytics.orders.insert({ data: { id: orderId, totalCents } });
    // @ts-expect-error database models come from the declared service schema
    await ctx.databases.analytics.customers.findMany();

    // @ts-expect-error a cache that is not declared is not available
    await ctx.cache.prices.get("sku");
    return { totalCents };
  },
});

defineFunction({
  id: "types.deps.cached-price",
  input: z.object({ sku: z.string() }),
  output: z.object({ cents: z.number().nullable() }),
  dependencies: { cache: { prices } },
  handler: async ({ sku }, ctx) => ({ cents: (await ctx.cache.prices.get(sku)) ?? null }),
});

defineFunction({
  id: "types.deps.wrong-kind",
  input: z.object({}),
  output: z.object({}),
  // @ts-expect-error a function dependency must be a function descriptor
  dependencies: { functions: { orderCreated } },
  handler: async () => ({}),
});
