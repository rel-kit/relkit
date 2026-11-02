/** POST /orders creates an order and answers 201. */
import { defineServiceRoutes } from "@relkit/app/routes";
import orders from "../../services/orders/service.js";

export const { POST } = defineServiceRoutes(orders, {
  POST: { member: "createOrder", successStatus: 201 },
});
