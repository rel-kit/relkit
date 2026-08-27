import { defineService } from "@relkit/app";
import createOrder from "@app/functions/orders/create-order.function.js";
import priceOrder from "@app/functions/orders/price-order.function.js";

const orders = defineService({ functions: { createOrder, priceOrder } });

export default orders;
