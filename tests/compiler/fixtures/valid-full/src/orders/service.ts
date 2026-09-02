import { defineService } from "@relkit/app";
import authorize from "./functions/authorize.function.js";
import createOrder from "./functions/create-order.function.js";
import getOrder from "./functions/get-order.function.js";

export default defineService({
  functions: { authorize, createOrder, getOrder },
});
