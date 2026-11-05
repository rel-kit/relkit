/** POST /orders creates an order and answers 201. */
import { defineServiceRoutes } from "relkit/routes";
import orders from "../../services/orders/service.js";

export default defineServiceRoutes(orders, {
  POST: { member: "createOrder", successStatus: 201 },
});
