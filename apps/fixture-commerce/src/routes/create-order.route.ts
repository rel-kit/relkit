import { defineRoute, http } from "@zsys/app";
import createOrder from "../functions/create-order.function.js";

const createOrderRoute = defineRoute({
  id: "orders.create.http",
  method: "POST",
  path: "/orders",
  target: createOrder,
  request: http.input({
    orderId: http.header("idempotency-key"),
    customerEmail: http.header("x-customer-email"),
    sku: http.body("sku"),
    quantity: http.body("quantity"),
  }),
  responses: [http.success(201, createOrder.output), http.validationError()],
});

export default createOrderRoute;
