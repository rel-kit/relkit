import { defineRoute, http } from "@zsys/app";
import Orders from "../../../services/orders.service.js";
import normalizeOrderId from "../../../transforms/orders/normalize-id.transform.js";
import ordersAuth from "../../../middleware/orders-auth.middleware.js";

export const GET = defineRoute({
  target: Orders.getOrder,
  request: http.input({
    orderId: http.transform(normalizeOrderId, http.path("orderId")),
  }),
  middleware: [ordersAuth],
});
