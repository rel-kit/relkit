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
