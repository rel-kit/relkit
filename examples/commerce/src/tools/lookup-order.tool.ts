import getOrder from "@app/functions/orders/get-order.function.js";

const lookupOrder = getOrder.asTool({
  id: "lookup-order",
  description: "Read one order by ID",
  sideEffect: "read",
  approval: "never",
  timeoutMs: 2_000,
});

export default lookupOrder;
