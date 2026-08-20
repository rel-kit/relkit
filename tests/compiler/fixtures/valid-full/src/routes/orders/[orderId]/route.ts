import { defineRoute, defineTransform, http } from "@zsys/app";
import getOrder from "../../../functions/get-order.function.js";
import orderAuth from "../../../middleware/order-auth.middleware.js";
import { z } from "@zsys/schema";

export const normalizeOrderId = defineTransform({
  id: "orders.normalize-id",
  schema: z.string(),
});

export const GET = defineRoute({
  id: "orders.get-route",
  target: getOrder,
  request: http.input({
    orderId: http.transform(normalizeOrderId, http.path("orderId")),
  }),
  middleware: [orderAuth],
  responses: [http.success(200, getOrder.output)],
});
