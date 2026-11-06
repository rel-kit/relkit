/** Maps order search GET requests to the service member's inferred optional status query. */
import { defineServiceRoutes } from "relkit/routes";
import orders from "../../../services/orders/service.js";

export default defineServiceRoutes(orders, { GET: "searchOrders" });
