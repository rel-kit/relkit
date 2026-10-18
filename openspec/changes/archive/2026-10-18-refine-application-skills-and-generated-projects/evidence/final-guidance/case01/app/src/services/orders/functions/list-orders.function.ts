import { defineFunction, fail } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import AuthenticationRequired from "../errors/authentication-required.error.js";
import { readCurrentUser } from "../helpers/current-user.js";
import { orderOutput } from "../schemas/order.schema.js";

export default defineFunction({
  id: "orders.list",
  input: z.object({}),
  output: z.array(orderOutput),
  errors: [AuthenticationRequired],
  handler: async (_input, context) => {
    const user = await readCurrentUser(context.auth);
    if (user === null) return fail(AuthenticationRequired, {});
    return context.database.orders.findMany({ where: { ownerId: user.id } });
  },
});
