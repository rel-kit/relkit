/** Maps the HTTP endpoint to its owning service's public member. */
import { defineServiceRoutes } from "relkit/routes";
import orders from "@app/services/orders/service.js";

export default defineServiceRoutes(orders, {
  POST: { member: "createOrder", successStatus: 201 },
});
