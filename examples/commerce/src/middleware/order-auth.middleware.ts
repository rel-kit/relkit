import { defineMiddleware, http } from "@zsys/app";
import authorizeOrder from "../functions/authorize-order.function.js";

const orderAuth = defineMiddleware({
  id: "orders.auth",
  target: authorizeOrder,
  request: http.input({ authorization: http.header("authorization") }),
  decision: http.continue(),
});

export default orderAuth;
