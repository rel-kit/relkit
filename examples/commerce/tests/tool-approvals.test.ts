import { expect, test } from "bun:test";
import lookupOrder from "@app/orders/tools/lookup-order.tool.js";
import cancelAlways from "@app/orders/tools/cancel-order.tool.js";
import { cancelOrder, cancelOrderWithApproval } from "./fixtures/cancel-order-with-approval.js";

test("never permits a read without a separate approval", async () => {
  expect(lookupOrder.approval).toBe("never");
  await expect(lookupOrder.invoke({ orderId: "order-123" })).resolves.toMatchObject({
    orderId: "order-123",
  });
});

test("on-write and always require a decision before cancelling", async () => {
  for (const tool of [cancelOrder, cancelAlways]) {
    await expect(tool.invoke({ orderId: "order-123" })).rejects.toMatchObject({
      code: "RELKIT_APPROVAL_REQUIRED",
    });
  }
});

test("synchronous approval callbacks accept booleans or decision strings", async () => {
  // #region sync-approvals
  await expect(
    cancelOrder.invoke({ orderId: "order-123" }, { approval: () => true }),
  ).resolves.toEqual({ orderId: "order-123", deleted: true });

  await expect(
    cancelOrder.invoke({ orderId: "order-123" }, { approval: () => "approved" }),
  ).resolves.toEqual({ orderId: "order-123", deleted: true });

  await expect(
    cancelOrder.invoke({ orderId: "order-123" }, { approval: () => false }),
  ).rejects.toMatchObject({ code: "RELKIT_APPROVAL_DENIED" });

  await expect(
    cancelOrder.invoke({ orderId: "order-123" }, { approval: () => "denied" }),
  ).rejects.toMatchObject({ code: "RELKIT_APPROVAL_DENIED" });
  // #endregion sync-approvals
});

test("asynchronous confirmation receives the exact action and fails closed", async () => {
  await expect(
    cancelOrderWithApproval("order-123", async (message) => {
      expect(message).toBe("Cancel order order-123?");
      return true;
    }),
  ).resolves.toEqual({ orderId: "order-123", deleted: true });
  await expect(cancelOrderWithApproval("order-123", async () => false)).rejects.toMatchObject({
    code: "RELKIT_APPROVAL_DENIED",
  });
  await expect(
    cancelOrderWithApproval("order-123", async () => {
      throw new Error("Confirmation unavailable");
    }),
  ).rejects.toThrow("Confirmation unavailable");
});
