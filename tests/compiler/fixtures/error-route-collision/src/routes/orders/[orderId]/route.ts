import { defineRoute, http } from "@relkit/app";
import getOrder from "../../../functions/get.function.js";

export const GET = defineRoute({
  id: "collision.second",
  target: getOrder,
  request: http.input({ id: http.path("orderId") }),
  responses: [http.success(200, getOrder.output)],
});
