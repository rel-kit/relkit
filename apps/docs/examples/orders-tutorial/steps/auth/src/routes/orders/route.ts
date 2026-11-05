/** Requires a signed-in session before creating an order. */
import { defineServiceRoutes } from "relkit/routes";
import orders from "@app/services/orders/service.js";

export default defineServiceRoutes(orders, {
  POST: { member: "createOrder", successStatus: 201, auth: "required" },
});
