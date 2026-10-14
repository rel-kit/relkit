/** Exposes tutorial creation, lookup and pricing functions through the immediate orders service boundary. */
import { defineService } from "@relkit/app/services";
import createOrder from "@app/services/orders/functions/create-order.function.js";
import getOrder from "@app/services/orders/functions/get-order.function.js";
import priceOrder from "@app/services/orders/functions/price-order.function.js";

export default defineService({ functions: { createOrder, getOrder, priceOrder } });
