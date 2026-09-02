import { defineServiceRoutes, http } from "@relkit/app/routes";
import rateLimits from "@app/orders/cache/rate-limits.cache.js";
import orders from "@app/orders/service.js";

export const { GET, POST } = defineServiceRoutes(orders, {
  GET: "searchOrders",
  POST: {
    member: "createOrder",
    request: http.input({
      orderId: http.header("idempotency-key"),
      customerEmail: http.header("x-customer-email"),
      sku: http.body("sku"),
      quantity: http.body("quantity"),
    }),
    rateLimit: {
      limit: 20,
      windowMs: 60_000,
      key: http.header("x-customer-email"),
      store: rateLimits,
    },
    successStatus: 201,
  },
});
