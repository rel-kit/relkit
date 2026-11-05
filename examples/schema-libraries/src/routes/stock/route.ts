/** Maps POST requests to `orders.checkStock`. */
import { defineRoute } from "relkit/routes";
import orders from "@app/services/orders/service.js";

export const POST = defineRoute({ target: orders.checkStock });
