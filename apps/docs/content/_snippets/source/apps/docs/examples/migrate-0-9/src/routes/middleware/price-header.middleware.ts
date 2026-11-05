import { defineMiddleware } from "relkit/routes";
import { getRelkit } from "relkit";

export default defineMiddleware("/orders/*", async (c, next) => {
  const { totalCents } = await getRelkit().functions.orders.priceOrder({ quantity: 1 });
  await next();
  c.header("x-unit-price-cents", String(totalCents));
});
