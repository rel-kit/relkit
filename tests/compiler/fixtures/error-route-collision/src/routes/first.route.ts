import { defineRoute, http } from "@zsys/app";
import getOrder from "../functions/get.function.js";

const first = defineRoute({
  id: "collision.first",
  method: "GET",
  path: "/orders/:id",
  target: getOrder,
  request: http.input({ id: http.path("id") }),
  responses: [http.success(200, getOrder.output)],
});

export default first;
