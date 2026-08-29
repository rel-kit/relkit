import { defineService } from "@relkit/app/services";
import createOrder from "./functions/create-order.function.js";
import deleteOrder from "./functions/delete-order.function.js";
import getOrder from "./functions/get-order.function.js";
import searchOrders from "./functions/search-orders.function.js";
import updateOrder from "./functions/update-order.function.js";
import authorizeOrder from "./functions/authorize-order.function.js";
import orderCancelled from "./events/order-cancelled.event.js";
import orderCreated from "./events/order-created.event.js";
import orderUpdated from "./events/order-updated.event.js";

export default defineService({
  functions: { createOrder, deleteOrder, getOrder, searchOrders, updateOrder, authorizeOrder },
  events: { orderCancelled, orderCreated, orderUpdated },
});
