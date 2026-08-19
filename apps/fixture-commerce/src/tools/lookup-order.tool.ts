import { defineTool } from "@zsys/app";
import getOrder from "../functions/get-order.function.js";

const lookupOrder = defineTool({
  id: "orders.get.tool",
  target: getOrder,
  description: "Read one order by ID",
  sideEffect: "read",
  approval: "never",
  timeoutMs: 2_000,
});

export default lookupOrder;
