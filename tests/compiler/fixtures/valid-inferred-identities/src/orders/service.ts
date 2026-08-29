import { defineService } from "@relkit/app";
import getOrder from "./functions/get-order.function.js";

const Orders = defineService({
  functions: { getOrder },
});

export default Orders;
