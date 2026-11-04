import { defineService } from "relkit";
import createOrder from "./functions/create-order.function.js";
import getOrder from "./functions/get-order.function.js";

export default defineService({ functions: { createOrder, getOrder } });
