import { defineError } from "relkit/functions";
import { s } from "relkit/schema";

const OrderNotFound = defineError({
  id: "orders.order-not-found.OrderNotFound",
  data: s.object({ orderId: s.string() }),
  message: ({ orderId }) => `Order ${orderId} was not found`,
  http: { status: 404 },
});

export default OrderNotFound;
