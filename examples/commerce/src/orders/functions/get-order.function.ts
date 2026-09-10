import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import orderNotFound from "@app/orders/errors/order-not-found.error.js";
import { orderLookupInput, orderLookupOutput } from "@app/platform/schemas.js";

const getOrder = defineFunction({
  input: orderLookupInput,
  output: orderLookupOutput,
  progress: z.object({
    stage: z.union([z.literal("lookup-started"), z.literal("lookup-completed")]),
  }),
  errors: [orderNotFound],
  handler: async (input, context) => {
    await context.progress.emit({ stage: "lookup-started" });
    if (input.orderId === "missing") return new orderNotFound(input);
    await context.progress.emit({ stage: "lookup-completed" });
    return { orderId: input.orderId, status: "confirmed", totalCents: 1_000 };
  },
});

export default getOrder;
