import { defineServiceRoutes } from "relkit/routes";
import orders from "../../services/orders/service.js";

export default defineServiceRoutes(orders, { POST: { member: "placeOrder", auth: "required" } });
