import { defineTask } from "@relkit/app/tasks";
import { z } from "@relkit/app/schema";

const order = z.object({
  id: z.string().min(1),
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
});

const exportOrders = defineTask({
  id: "orders.export-orders",
  version: "1",
  execution: "durable",
  input: z.object({ orders: z.array(order) }),
  output: z.object({ csv: z.string(), orderCount: z.number().int(), totalCents: z.number().int() }),
  handler: async ({ orders }, context) => {
    const lines = ["order_id,sku,quantity,total_cents"];
    let totalCents = 0;
    for (const item of orders) {
      const lineTotal = item.quantity * item.unitPriceCents;
      totalCents += lineTotal;
      lines.push([item.id, item.sku, item.quantity, lineTotal].join(","));
    }
    context.log.info("Orders CSV prepared", { orderCount: orders.length, totalCents });
    return { csv: lines.join("\n") + "\n", orderCount: orders.length, totalCents };
  },
});

export default exportOrders;
