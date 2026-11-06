import { defineFunction } from "relkit";
import { z } from "relkit/schema";

export default defineFunction({
  input: z.object({ orderId: z.string() }),
  output: z.object({ orderId: z.string() }),
  handler: async ({ orderId }) => ({ orderId }),
});
