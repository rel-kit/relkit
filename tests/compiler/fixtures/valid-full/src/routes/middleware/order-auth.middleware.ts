import { defineMiddleware } from "@relkit/app";
import orders from "../../orders/service.js";

const orderAuth = defineMiddleware("/orders/*", async (context, next) => {
  const result = await orders.authorize.invoke({
    authorization: context.req.header("authorization") ?? "",
  });
  if (!result.allowed) return context.json({ error: "unauthorized" }, 401);
  await next();
});

export default orderAuth;
