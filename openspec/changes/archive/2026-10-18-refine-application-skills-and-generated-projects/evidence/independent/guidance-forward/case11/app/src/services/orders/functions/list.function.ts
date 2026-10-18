import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import { AuthenticationRequired, requireUser } from "@app/services/auth/service.js";
import { order } from "../schemas/order.schema.js";

export default defineFunction({
  id: "orders.list",
  input: z.object({}),
  output: z.array(order),
  errors: [AuthenticationRequired],
  handler: async (_input, context) => {
    const user = await requireUser(context.auth);
    return context.database.orders.findMany({ where: { userId: user.id } });
  },
});
