import { defineRoute, defineTransform, http } from "@relkit/app";
import orders from "../../../orders/service.js";
import { z } from "@relkit/schema";

export const normalizeOrderId = defineTransform({
  id: "orders.normalize-id",
  schema: z.string(),
});

export const GET = defineRoute({
  id: "orders.get-route",
  target: orders.getOrder,
  request: http.input({
    orderId: http.transform(normalizeOrderId, http.path("orderId")),
  }),
  responses: [http.success(200, orders.getOrder.output)],
});
