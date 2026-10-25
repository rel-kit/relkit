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
