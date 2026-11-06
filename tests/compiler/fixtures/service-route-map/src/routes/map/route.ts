import { defineServiceRoutes } from "relkit";
import orders from "../../orders/service.js";

export default defineServiceRoutes(orders, {
  GET: "getOrder",
  POST: { member: "createOrder", successStatus: 201 },
});
