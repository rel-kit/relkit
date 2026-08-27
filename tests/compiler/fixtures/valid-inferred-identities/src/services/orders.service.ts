import { defineService } from "@relkit/app";
import getOrder from "../functions/orders/get-order.function.js";
import ordersContext from "./orders-context.service-middleware.js";

const Orders = defineService({
  functions: { getOrder },
  middleware: [ordersContext],
});

export default Orders;
