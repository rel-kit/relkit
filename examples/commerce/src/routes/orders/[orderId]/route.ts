import { defineRoute, defineTransform, http } from "@zsys/app";
import getOrder from "../../../functions/get-order.function.js";
import updateOrder from "../../../functions/update-order.function.js";
import deleteOrder from "../../../functions/delete-order.function.js";
import orderNotFound from "../../../errors/order-not-found.error.js";
import orderAuth from "../../../middleware/order-auth.middleware.js";
import { z } from "@zsys/schema";

export const normalizeOrderId = defineTransform({
  id: "orders.normalize-id",
  schema: z.string().min(1),
});

export const GET = defineRoute({
  id: "orders.get-route",
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

export const HEAD = defineRoute({ id: "orders.head", target: getOrder });
export const PUT = defineRoute({ id: "orders.replace", target: updateOrder });
export const PATCH = defineRoute({ id: "orders.update.http", target: updateOrder });
export const DELETE = defineRoute({
  id: "orders.delete.http",
  target: deleteOrder,
  successStatus: 202,
});
export const OPTIONS = defineRoute({ id: "orders.options", target: getOrder });
