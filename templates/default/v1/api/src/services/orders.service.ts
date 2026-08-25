import { defineService } from "@zsys/app";
import createOrder from "../functions/orders/create-order.function.js";
import priceOrder from "../functions/orders/price-order.function.js";

const orders = defineService({ functions: { createOrder, priceOrder } });

export default orders;
