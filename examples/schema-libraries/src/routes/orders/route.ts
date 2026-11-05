/** Maps POST requests to `orders.placeOrder`. */
import { defineRoute } from "relkit/routes";
import orders from "@app/services/orders/service.js";

export const POST = defineRoute({ target: orders.placeOrder });
