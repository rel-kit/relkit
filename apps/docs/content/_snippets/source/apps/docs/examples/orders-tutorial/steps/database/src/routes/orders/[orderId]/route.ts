/** Maps the order GET route to its service lookup member with inferred path input and validated response. */
import { defineServiceRoutes } from "relkit/routes";
import orders from "@app/services/orders/service.js";

export default defineServiceRoutes(orders, { GET: { member: "getOrder" } });
