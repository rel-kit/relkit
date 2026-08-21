import { defineRoute, http } from "@zsys/app";
import orders from "../../../services/orders.service.js";
import orderNotFound from "../../../errors/order-not-found.error.js";
import orderAuth from "../../../middleware/order-auth.middleware.js";
import normalizeOrderId from "../../../transforms/orders/normalize-id.transform.js";

export const GET = defineRoute({
  target: orders.getOrder,
  request: http.input({
    orderId: http.transform(normalizeOrderId, http.path("orderId")),
  }),
  middleware: [orderAuth],
  responses: [
    http.success(200, orders.getOrder.output),
    http.error(orderNotFound.id, 404, orderNotFound.data),
    http.validationError(),
  ],
});

export const HEAD = defineRoute({ target: orders.getOrder });
export const PUT = defineRoute({ target: orders.updateOrder });
export const PATCH = defineRoute({ target: orders.updateOrder });
export const DELETE = defineRoute({
  target: orders.deleteOrder,
  successStatus: 202,
});
export const OPTIONS = defineRoute({ target: orders.getOrder });
