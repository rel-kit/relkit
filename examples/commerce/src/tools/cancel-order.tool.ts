import deleteOrder from "@app/functions/orders/delete-order.function.js";

const cancelOrder = deleteOrder.asTool({
  id: "cancel-order",
  description: "Cancel one order after a human approves the write",
  sideEffect: "write",
  approval: "always",
  timeoutMs: 2_000,
});

export default cancelOrder;
