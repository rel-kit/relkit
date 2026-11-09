import { defineMiddleware } from "relkit";

export default defineMiddleware("/orders/*", async (context, next) => {
  if (!context.req.header("authorization")) {
    return context.json({ error: "unauthorized" }, 401);
  }
  await next();
});
