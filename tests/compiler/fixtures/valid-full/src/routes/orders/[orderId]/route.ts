import { defineRoute, defineTransform, http } from "@relkit/app";
import getOrder from "../../../functions/get-order.function.js";
import { z } from "@relkit/schema";

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
  responses: [http.success(200, getOrder.output)],
});
