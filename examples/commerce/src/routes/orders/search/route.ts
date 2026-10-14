/** Maps order search GET requests to the service member's inferred optional status query. */
import { defineServiceRoutes } from "@relkit/app/routes";
import orders from "../../../services/orders/service.js";

export const { GET } = defineServiceRoutes(orders, { GET: "searchOrders" });
