import { defineTool } from "@relkit/app/tools";
import deleteOrder from "../../src/services/orders/functions/delete-order.function.js";

export const cancelOrder = defineTool({
  id: "orders.cancel-order-on-write",
  target: deleteOrder,
  description: "Cancel an order after confirmation",

  sideEffect: "write",
  approval: "on-write",
  timeoutMs: 2_000,
  mcp: false,
});
