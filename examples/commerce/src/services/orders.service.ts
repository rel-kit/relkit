import { defineService } from "@relkit/app/services";
import createOrder from "@app/functions/orders/create-order.function.js";
import deleteOrder from "@app/functions/orders/delete-order.function.js";
import getOrder from "@app/functions/orders/get-order.function.js";
import searchOrders from "@app/functions/orders/search-orders.function.js";
import updateOrder from "@app/functions/orders/update-order.function.js";
import ordersContext from "@app/services/orders-context.service-middleware.js";

const orders = defineService({
  functions: { createOrder, deleteOrder, getOrder, searchOrders, updateOrder },
  middleware: [ordersContext],
});

export default orders;
