/** Connects an on-write order tool to a trusted asynchronous confirmation callback, preserving denied invocation failures. */
// #region approval-tool
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
// #endregion approval-tool

// #region approval-callback
/** Invokes cancellation only after the trusted confirmation flow approves the exact order.
 * @param orderId - Order identity shown to confirmation and passed to the tool.
 * @param confirm - Trusted asynchronous decision callback.
 * @returns The native checked deletion result when approval succeeds.
 * @throws The original invocation failure when confirmation denies or fails. */
export async function cancelOrderWithApproval(
  orderId: string,
  confirm: (message: string) => Promise<boolean>,
): Promise<{ orderId: string; deleted: boolean }> {
  return cancelOrder.invoke(
    { orderId },
    {
      // Ask your trusted confirmation flow about this specific order.
      approval: async () => {
        const confirmed = await confirm(`Cancel order ${orderId}?`);
        return confirmed ? "approved" : "denied";
      },
    },
  );
}
// #endregion approval-callback
