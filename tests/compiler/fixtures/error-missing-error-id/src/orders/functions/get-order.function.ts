import { defineError, defineFunction } from "relkit";
import { z } from "relkit/schema";
import notFound from "../errors/not-found.error.js";

const InvalidError = defineError({
  data: z.object({ orderId: z.string() }),
  message: "The order ID is invalid",
});

export default defineFunction({
  input: z.object({ orderId: z.string() }),
  output: z.object({ orderId: z.string() }),
  errors: [notFound, InvalidError],
  handler: async ({ orderId }) => ({ orderId }),
});
