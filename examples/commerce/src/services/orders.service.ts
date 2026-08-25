import { defineService } from "@zsys/app";
import createOrder from "../functions/orders/create-order.function.js";
import deleteOrder from "../functions/orders/delete-order.function.js";
import getOrder from "../functions/orders/get-order.function.js";
import searchOrders from "../functions/orders/search-orders.function.js";
import updateOrder from "../functions/orders/update-order.function.js";
import ordersContext from "./orders-context.service-middleware.js";

const orders = defineService({
  functions: { createOrder, deleteOrder, getOrder, searchOrders, updateOrder },
  middleware: [ordersContext],
});

export default orders;
