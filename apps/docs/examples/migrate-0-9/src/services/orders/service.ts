import { defineService } from "relkit/services";
import getOrder from "./functions/get-order.function.js";
import placeOrder from "./functions/place-order.function.js";
import priceOrder from "./functions/price-order.function.js";

export default defineService({ functions: { getOrder, placeOrder, priceOrder } });
