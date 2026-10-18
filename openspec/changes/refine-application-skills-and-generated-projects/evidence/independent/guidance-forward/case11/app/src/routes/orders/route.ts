import { defineServiceRoutes } from "@relkit/app/routes";
import orders from "@app/services/orders/service.js";
export const { GET, POST } = defineServiceRoutes(orders, {
  GET: "list",
  POST: { member: "create", successStatus: 201 },
});
