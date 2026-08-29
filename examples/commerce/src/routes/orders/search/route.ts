import { defineServiceRoutes } from "@relkit/app/routes";
import orders from "@app/orders/service.js";

export const { GET } = defineServiceRoutes(orders, { GET: "searchOrders" });
