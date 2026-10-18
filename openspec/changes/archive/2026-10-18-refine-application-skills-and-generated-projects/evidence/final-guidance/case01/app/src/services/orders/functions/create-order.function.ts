import { defineFunction, fail } from "@relkit/app/functions";
import AuthenticationRequired from "../errors/authentication-required.error.js";
import { readCurrentUser } from "../helpers/current-user.js";
import { createOrderInput, orderOutput } from "../schemas/order.schema.js";

export default defineFunction({
  id: "orders.create",
  input: createOrderInput,
  output: orderOutput,
  errors: [AuthenticationRequired],
  handler: async ({ sku, quantity }, context) => {
    const user = await readCurrentUser(context.auth);
    if (user === null) return fail(AuthenticationRequired, {});
    return context.database.orders.insert({
      data: { id: crypto.randomUUID(), ownerId: user.id, sku, quantity },
    });
  },
});
