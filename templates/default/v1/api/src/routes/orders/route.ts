/** Maps the HTTP endpoint to its owning service's public member. */
import { defineServiceRoutes } from "@relkit/app/routes";
import orders from "@app/services/orders/service.js";

export const { POST } = defineServiceRoutes(orders, {
  POST: { member: "createOrder", successStatus: 201 },
});
