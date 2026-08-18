import { defineMiddleware, http } from "@zsys/app";
import authorize from "../functions/authorize.function.js";

const orderAuth = defineMiddleware({
  id: "orders.auth",
  target: authorize,
  request: http.input({ authorization: http.header("authorization") }),
  decision: http.continue(),
});

export default orderAuth;
