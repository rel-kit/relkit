/** GET /orders/:orderId reads the path parameter into the function's input. */
import { defineRoute } from "relkit/routes";
import orders from "../../../services/orders/service.js";

export const GET = defineRoute({ target: orders.getOrder });
