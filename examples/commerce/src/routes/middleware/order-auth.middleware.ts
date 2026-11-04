/** Checks the demonstration order authorization function before forwarding matching HTTP requests; denial returns 401. */
import { getRelkit } from "@relkit/app";
import { defineMiddleware } from "@relkit/app/routes";

const orderAuth = defineMiddleware("/orders/*", async (context, next) => {
  const result = await getRelkit().functions.orders.authorizeOrder({
    authorization: context.req.header("authorization") ?? "",
  });
  if (!result.allowed) return context.json({ error: "unauthorized" }, 401);
  await next();
});

export default orderAuth;
