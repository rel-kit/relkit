import { defineServiceMiddleware } from "@zsys/app";

export default defineServiceMiddleware({
  id: "orders.context",
  handler: async (_invocation, next) => {
    await next({ domain: "orders" });
  },
});
