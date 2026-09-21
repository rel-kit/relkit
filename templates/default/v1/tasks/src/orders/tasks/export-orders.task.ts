import { defineTask } from "@relkit/app/tasks";
import { z } from "@relkit/app/schema";

const exportOrders = defineTask({
  id: "orders.export-orders",
  version: "1",
  execution: "durable",
  input: z.object({ orderIds: z.array(z.string()) }),
  output: z.object({ exported: z.number().int().nonnegative() }),
  progress: z.object({ completed: z.number().int().nonnegative() }),
  handler: async ({ orderIds }, context) => {
    await context.progress.emit({ completed: 0 });
    context.log.info("fake order export", { count: orderIds.length });
    await context.progress.emit({ completed: orderIds.length });
    return { exported: orderIds.length };
  },
});

export default exportOrders;
