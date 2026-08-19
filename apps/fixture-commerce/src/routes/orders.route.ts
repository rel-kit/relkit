import { defineRoute, defineTransform, http } from "@zsys/app";
import getOrder from "../functions/get-order.function.js";
import orderNotFound from "../errors/order-not-found.error.js";
import orderAuth from "../middleware/order-auth.middleware.js";
import { z } from "@zsys/schema";

export const normalizeOrderId = defineTransform({
  id: "orders.normalize-id",
  schema: z.string().min(1),
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
  responses: [
    http.success(200, getOrder.output),
    http.error(orderNotFound.id, 404, orderNotFound.data),
    http.validationError(),
  ],
});

export default orders;
