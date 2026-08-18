import { defineRoute, defineTransform, http } from "@zsys/app";
import getOrder from "../functions/get-order.function.js";
import orderAuth from "../middleware/order-auth.middleware.js";
import { z } from "@zsys/schema";

const normalizeOrderId = defineTransform({
  id: "orders.normalize-id",
  schema: z.string(),
});

const orders = defineRoute({
  id: "orders.get-route",
  method: "GET",
  path: "/orders/:orderId",
  target: getOrder,
  request: http.input({
    orderId: http.transform(normalizeOrderId, http.path("orderId")),
  }),
  middleware: [orderAuth],
  responses: [http.success(200, getOrder.output)],
});

export { normalizeOrderId };
export default orders;
