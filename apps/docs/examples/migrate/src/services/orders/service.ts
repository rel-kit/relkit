/** Declares the orders service and the functions its routes may call. */
import { defineService } from "relkit/services";
import createOrder from "./functions/create-order.function.js";
import getOrder from "./functions/get-order.function.js";

export default defineService({ functions: { createOrder, getOrder } });
