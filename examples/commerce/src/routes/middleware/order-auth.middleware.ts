/** Checks the demonstration order authorization function before forwarding matching HTTP requests; denial returns 401. */
import { defineMiddleware } from "@relkit/app/routes";
import orders from "../../services/orders/service.js";

const orderAuth = defineMiddleware("/orders/*", async (context, next) => {
  const result = await orders.authorizeOrder.invoke({
    authorization: context.req.header("authorization") ?? "",
  });
  if (!result.allowed) return context.json({ error: "unauthorized" }, 401);
  await next();
});

export default orderAuth;
