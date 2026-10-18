import { defineService } from "@relkit/app/services";
import createOrder from "./functions/create-order.function.js";
import listOrders from "./functions/list-orders.function.js";

export default defineService({ functions: { createOrder, listOrders } });
