import { defineFunction } from "@relkit/app/functions";
import { AuthenticationRequired, requireUser } from "@app/services/auth/service.js";
import { createOrderInput, orderOutput } from "../schemas/order.schema.js";

export default defineFunction({
  id: "orders.create",
  input: createOrderInput,
  output: orderOutput,
  errors: [AuthenticationRequired],
  handler: async ({ sku, quantity }, context) => {
    const user = await requireUser(context.auth);
    return context.database.orders.insert({
      data: { id: crypto.randomUUID(), ownerId: user.id, sku, quantity },
    });
  },
});
