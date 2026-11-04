/** Checks that removed forms no longer type-check: descriptor `.invoke()`, the schema aliases,
 * channel `.trigger()` and `.getPresence()`, and the `publishes` option.
 */
import { defineEvent } from "relkit/events";
import { defineFunction } from "relkit/functions";
import { defineTask } from "relkit/jobs";
import { defineChannel } from "relkit/realtime";
import * as routes from "relkit/routes";
import * as schema from "relkit/schema";
import { z } from "relkit/schema";

const priceOrder = defineFunction({
  id: "types.removed.price-order",
  input: z.object({ quantity: z.number() }),
  output: z.object({ totalCents: z.number() }),
  handler: async ({ quantity }) => ({ totalCents: quantity * 100 }),
});
const orderCreated = defineEvent({
  id: "types.removed.order-created",
  version: 1,
  input: z.object({ orderId: z.string() }),
});
const orderUpdates = defineChannel({
  id: "types.removed.order-updates",
  params: z.object({ orderId: z.string() }),
  events: { changed: z.object({ status: z.string() }) },
  client: { public: true },
  presence: "count",
});

// @ts-expect-error the schema builder keeps void() for "no result"
void z.undefined();
// @ts-expect-error getJsonSchema is the one JSON Schema projection
void schema.toJsonSchema;
// @ts-expect-error defineTransform is the one transform constructor
void routes.defineRequestTransform;
// @ts-expect-error functions are called through ctx.functions or the runtime handle
void priceOrder.invoke({ quantity: 1 });
// @ts-expect-error channels are triggered through ctx.channels
void orderUpdates.trigger({ orderId: "o1" }, "changed", { status: "paid" });
// @ts-expect-error presence is read through ctx.channels
void orderUpdates.getPresence({ orderId: "o1" });

defineFunction({
  id: "types.removed.publisher",
  input: z.object({ orderId: z.string() }),
  output: z.object({}),
  // @ts-expect-error events are declared under dependencies.events
  publishes: ["types.removed.order-created"],
  handler: async () => ({}),
});

defineTask({
  id: "types.removed.task",
  input: z.object({ orderId: z.string() }),
  output: z.object({}),
  // @ts-expect-error events are declared under dependencies.events
  publishes: ["types.removed.order-created"],
  handler: async () => ({}),
});

defineFunction({
  id: "types.removed.replacement",
  input: z.object({ orderId: z.string(), quantity: z.number() }),
  output: z.object({ totalCents: z.number() }),
  dependencies: {
    functions: { priceOrder },
    events: { orderCreated },
    channels: { orderUpdates },
  },
  handler: async ({ orderId, quantity }, ctx) => {
    const price = await ctx.functions.priceOrder({ quantity });
    await ctx.events.orderCreated.publish({ orderId });
    await ctx.channels.orderUpdates.trigger({ orderId }, "changed", { status: "priced" });
    return price;
  },
});
