/** Durable task with progress. */
import { defineTask } from "relkit/tasks";
import { s } from "relkit/schema";

export default defineTask({
  id: "orders.export",
  version: "1",
  execution: "durable",
  input: s.object({ orderIds: s.array(s.string()) }),
  output: s.object({ exported: s.number().int() }),
  progress: s.object({ completed: s.number().int() }),
  handler: async (input, context) => {
    await context.progress.emit({ completed: input.orderIds.length });
    return { exported: input.orderIds.length };
  },
});
