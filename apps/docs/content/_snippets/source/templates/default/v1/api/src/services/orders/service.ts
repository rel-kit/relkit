/** Declares the orders service boundary and its public members. */
import { defineService } from "@relkit/app/services";
import createOrder from "@app/services/orders/functions/create-order.function.js";
import priceOrder from "@app/services/orders/functions/price-order.function.js";

export default defineService({
  functions: { createOrder, priceOrder },
});
