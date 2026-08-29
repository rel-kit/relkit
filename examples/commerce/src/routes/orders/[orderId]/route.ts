import { defineServiceRoutes, http } from "@relkit/app/routes";
import orders from "@app/orders/service.js";
import normalizeOrderId from "@app/routes/transforms/orders/normalize-id.transform.js";

export const { GET, HEAD, PUT, PATCH, DELETE, OPTIONS } = defineServiceRoutes(orders, {
  GET: {
    member: "getOrder",
    request: http.input({
      orderId: http.transform(normalizeOrderId, http.path("orderId")),
    }),
  },
  HEAD: "getOrder",
  PUT: "updateOrder",
  PATCH: "updateOrder",
  DELETE: { member: "deleteOrder", successStatus: 202 },
  OPTIONS: "getOrder",
});
