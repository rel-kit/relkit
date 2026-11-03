/** Requires a signed-in session before reading an order. */
import { defineServiceRoutes } from "@relkit/app/routes";
import orders from "@app/services/orders/service.js";

export const { GET } = defineServiceRoutes(orders, {
  GET: { member: "getOrder", auth: "required" },
});
