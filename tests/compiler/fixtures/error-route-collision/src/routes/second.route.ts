import { defineRoute, http } from "@zsys/app";
import getOrder from "../functions/get.function.js";

const second = defineRoute({
  id: "collision.second",
  method: "GET",
  path: "/orders/:orderId",
  target: getOrder,
  request: http.input({ id: http.path("orderId") }),
  responses: [http.success(200, getOrder.output)],
});

export default second;
