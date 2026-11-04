import { defineMiddleware } from "relkit";
import { getRelkit } from "relkit";

const orderAuth = defineMiddleware("/orders/*", async (context, next) => {
  const result = await getRelkit().functions.orders.authorize({
    authorization: context.req.header("authorization") ?? "",
  });
  if (!result.allowed) return context.json({ error: "unauthorized" }, 401);
  await next();
});

export default orderAuth;
