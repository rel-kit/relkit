/** Maps the order GET route to its service lookup member with inferred path input and validated response. */
import { defineServiceRoutes } from "@relkit/app/routes";
import orders from "@app/services/orders/service.js";

export const { GET } = defineServiceRoutes(orders, { GET: { member: "getOrder" } });
