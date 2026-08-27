import { defineRoute } from "@relkit/app";
import orders from "../../services/orders.service.js";

export const POST = defineRoute({
  target: orders.createOrder,
  successStatus: 201,
});
