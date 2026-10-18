import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import { AuthenticationRequired, requireUser } from "@app/services/auth/service.js";
import { order } from "../schemas/order.schema.js";

export default defineFunction({
  id: "orders.create",
  input: z.object({ label: z.string().min(1) }),
  output: order,
  errors: [AuthenticationRequired],
  handler: async ({ label }, context) => {
    const user = await requireUser(context.auth);
    return context.database.orders.insert({ data: { id: crypto.randomUUID(), userId: user.id, label } });
  },
});
