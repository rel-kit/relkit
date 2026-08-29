import { defineServiceRoutes, http } from "@relkit/app/routes";
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
    successStatus: 201,
  },
});
