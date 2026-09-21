import { defineTask } from "@relkit/app/tasks";
import { z } from "@relkit/app/schema";
import { exportOrderCsv } from "@app/orders/helpers/fake-business.js";

const exportOrders = defineTask({
  id: "orders.export-orders",
  version: "1",
  execution: "durable",
  input: z.object({ orderIds: z.array(z.string()) }),
  output: z.object({ csv: z.string(), exported: z.number().int().nonnegative() }),
  progress: z.object({
    completed: z.number().int().nonnegative(),
    total: z.number().int().positive(),
  }),
  handler: async ({ orderIds }, context) => {
    await context.progress.emit({ completed: 0, total: orderIds.length });
    const csv = exportOrderCsv(orderIds);
    await context.progress.emit({ completed: orderIds.length, total: orderIds.length });
    return { csv, exported: orderIds.length };
  },
});

export default exportOrders;
