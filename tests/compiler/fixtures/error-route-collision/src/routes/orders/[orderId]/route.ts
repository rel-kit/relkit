import { defineRoute, http } from "@relkit/app";
import collision from "../../../collision/service.js";

export const GET = defineRoute({
  id: "collision.second",
  target: collision.getOrder,
  request: http.input({ id: http.path("orderId") }),
  responses: [http.success(200, collision.getOrder.output)],
});
