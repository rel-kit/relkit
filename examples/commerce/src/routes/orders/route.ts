import { defineRoute, http } from "@relkit/app";
import orders from "@app/services/orders.service.js";
import prices from "@app/cache/prices.cache.js";

export const GET = defineRoute({
  target: orders.searchOrders,
  rateLimit: {
    limit: 2,
    windowMs: 60_000,
    key: http.header("x-api-key"),
    store: prices,
  },
});

export const POST = defineRoute({
  target: orders.createOrder,
  request: http.input({
    orderId: http.header("idempotency-key"),
    customerEmail: http.header("x-customer-email"),
    sku: http.body("sku"),
    quantity: http.body("quantity"),
  }),
  responses: [http.success(201, orders.createOrder.output), http.validationError()],
});
