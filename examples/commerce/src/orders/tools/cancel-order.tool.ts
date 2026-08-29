import deleteOrder from "@app/orders/functions/delete-order.function.js";

const cancelOrder = deleteOrder.asTool({
  id: "orders.cancel-order",
  description: "Cancel one order after a human approves the write",
  sideEffect: "write",
  approval: "always",
  timeoutMs: 2_000,
});

export default cancelOrder;
