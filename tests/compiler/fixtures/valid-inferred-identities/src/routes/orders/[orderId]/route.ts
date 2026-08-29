import { defineRoute, http } from "@relkit/app";
import Orders from "../../../orders/service.js";
import normalizeOrderId from "../../transforms/normalize-id.transform.js";

export const GET = defineRoute({
  target: Orders.getOrder,
  request: http.input({
    orderId: http.transform(normalizeOrderId, http.path("orderId")),
  }),
});
