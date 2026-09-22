import { defineService } from "@relkit/app/services";
import createOrder from "@app/orders/functions/create-order.function.js";
import getOrder from "@app/orders/functions/get-order.function.js";
import priceOrder from "@app/orders/functions/price-order.function.js";

export default defineService({ functions: { createOrder, getOrder, priceOrder } });
