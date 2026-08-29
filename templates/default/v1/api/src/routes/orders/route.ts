import { defineServiceRoutes } from "@relkit/app/routes";
import orders from "@app/orders/service.js";

export const { POST } = defineServiceRoutes(orders, {
  POST: { member: "createOrder", successStatus: 201 },
});
