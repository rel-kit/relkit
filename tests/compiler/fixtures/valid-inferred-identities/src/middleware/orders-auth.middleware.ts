import { defineMiddleware } from "@relkit/app";
import authorize from "../functions/orders/authorize.function.js";

export default defineMiddleware("/orders/*", async (context, next) => {
  const result = await authorize.invoke({
    authorization: context.req.header("authorization") ?? "",
  });
  if (!result.allowed) return context.json({ error: "unauthorized" }, 401);
  await next();
});
