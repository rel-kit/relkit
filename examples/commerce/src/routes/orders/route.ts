import { defineRoute, http } from "@zsys/app";
import createOrder from "../../functions/create-order.function.js";
import searchOrders from "../../functions/search-orders.function.js";
import prices from "../../cache/prices.cache.js";

export const GET = defineRoute({
  id: "orders.list.http",
  target: searchOrders,
  rateLimit: {
    limit: 2,
    windowMs: 60_000,
    key: http.header("x-api-key"),
    store: prices,
  },
});

export const POST = defineRoute({
  id: "orders.create.http",
  target: createOrder,
  request: http.input({
    orderId: http.header("idempotency-key"),
    customerEmail: http.header("x-customer-email"),
    sku: http.body("sku"),
    quantity: http.body("quantity"),
  }),
  responses: [http.success(201, createOrder.output), http.validationError()],
});
