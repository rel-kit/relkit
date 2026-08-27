import { defineServiceMiddleware } from "@relkit/app";

export default defineServiceMiddleware({
  id: "orders.context",
  handler: async (_invocation, next) => {
    await next({ tenant: "orders" });
  },
});
