/** Routes: a service table with mapped input, and a single route. */
import { defineRoute, defineServiceRoutes, http } from "relkit/routes";
import orders from "./service.js";

export default defineServiceRoutes(orders, {
  POST: {
    member: "createOrder",
    request: http.input({
      orderId: http.path("orderId"),
      sku: http.query("sku"),
      quantity: http.body("quantity"),
    }),
    successStatus: 201,
    response: (order) => ({ headers: { location: `/orders/${order.orderId}` } }),
  },
});

export const PUT = defineRoute({ target: orders.createOrder, successStatus: 200 });
