import { defineMiddleware, http } from "@zsys/app";
import authorize from "../functions/orders/authorize.function.js";

export default defineMiddleware({
  target: authorize,
  request: http.input({ authorization: http.header("authorization") }),
  decision: http.continue(),
});
