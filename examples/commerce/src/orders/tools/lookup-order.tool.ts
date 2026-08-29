import getOrder from "@app/orders/functions/get-order.function.js";

const lookupOrder = getOrder.asTool({
  // The tool keeps the function's checked input and output schemas.
  id: "orders.lookup-order",
  description: "Read one order by ID",
  // Models may call this read-only tool without a human approval step.
  sideEffect: "read",
  approval: "never",
  timeoutMs: 2_000,
});

export default lookupOrder;
