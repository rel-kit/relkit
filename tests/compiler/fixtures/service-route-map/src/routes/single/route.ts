import { defineRoute } from "relkit";
import orders from "../../orders/service.js";

export const GET = defineRoute({ target: orders.getOrder });
export const POST = defineRoute({ target: orders.createOrder, successStatus: 201 });
