import { defineMiddleware } from "@relkit/app";
import authorizeOrder from "@app/functions/authorize-order.function.js";

const orderAuth = defineMiddleware("/orders/*", async (context, next) => {
  const result = await authorizeOrder.invoke({
    authorization: context.req.header("authorization") ?? "",
  });
  if (!result.allowed) return context.json({ error: "unauthorized" }, 401);
  await next();
});

export default orderAuth;
