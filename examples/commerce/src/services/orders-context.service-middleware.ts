import { defineServiceMiddleware } from "@relkit/app/services";

export default defineServiceMiddleware({
  id: "orders.context",
  handler: async (_invocation, next) => {
    await next({ domain: "orders" });
  },
});
