import { defineRoute, http } from "@relkit/app";
import Orders from "../../../services/orders.service.js";
import normalizeOrderId from "../../../transforms/orders/normalize-id.transform.js";

export const GET = defineRoute({
  target: Orders.getOrder,
  request: http.input({
    orderId: http.transform(normalizeOrderId, http.path("orderId")),
  }),
});
