import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import { AuthenticationRequired, requireUser } from "@app/services/auth/service.js";
import { orderOutput } from "../schemas/order.schema.js";

export default defineFunction({
  id: "orders.list",
  input: z.object({}),
  output: z.array(orderOutput),
  errors: [AuthenticationRequired],
  handler: async (_input, context) => {
    const user = await requireUser(context.auth);
    return context.database.orders.findMany({ where: { ownerId: user.id } });
  },
});
