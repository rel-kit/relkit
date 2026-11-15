/** Function that uses every kind of dependency and the generated context. */
import { defineFunction } from "relkit/functions";
import { s } from "relkit/schema";
import orderNotFound from "./order-not-found.error.js";
import orderPlaced from "./order-placed.event.js";
import orderUpdates from "./order-updates.channel.js";
import prices from "./prices.cache.js";
import uploads from "./uploads.bucket.js";

export default defineFunction({
  id: "orders.create",
  access: { roles: ["owner"], permissions: ["order:create"] },
  input: s.object({ orderId: s.string(), sku: s.string(), quantity: s.number().int() }),
  output: s.object({ orderId: s.string(), totalCents: s.number().int() }),
  errors: [orderNotFound],
  dependencies: {
    events: { orderPlaced },
    channels: { orderUpdates },
    buckets: { uploads },
    cache: { prices },
  },
  timeoutMs: 10_000,
  handler: async (input, context) => {
    const session = await context.auth.getSession();
    const existing = await context.database.orders.findOne({ where: { id: input.orderId } });
    if (existing !== null) return orderNotFound.create({ orderId: input.orderId });
    await context.database.orders.insert({
      data: { id: input.orderId, sku: input.sku, quantity: input.quantity, status: "placed" },
    });
    const price = await context.cache.prices.getOrSet({ sku: input.sku }, async () => 100);
    await context.events.orderPlaced.publish({ orderId: input.orderId, quantity: input.quantity });
    await context.channels.orderUpdates.trigger({ orderId: input.orderId }, "status.changed", {
      orderId: input.orderId,
      status: "placed",
    });
    context.log.info("order created", { user: session?.user.id ?? "anonymous" });
    void context.buckets.uploads;
    void context.env.LOG_LEVEL;
    return { orderId: input.orderId, totalCents: price * input.quantity };
  },
});
