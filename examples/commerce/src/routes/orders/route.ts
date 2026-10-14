/**
 * Maps order HTTP operations to public service members with the existing request
 * and rate-limit policies. The rate-limit reference addresses the declared cache
 * by its stable identity without importing a private service implementation.
 */
import { defineServiceRoutes, http } from "@relkit/app/routes";
import { z } from "@relkit/app/schema";
import orders from "../../services/orders/service.js";

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
      store: {
        ref: { kind: "cache", id: "orders.rate-limits" },
        key: z.string(),
        value: z.number().int().nonnegative(),
      },
    },
    successStatus: 201,
  },
});
