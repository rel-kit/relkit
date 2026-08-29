import { defineTool } from "@relkit/app";
import getOrder from "../functions/get-order.function.js";

const lookupOrder = defineTool({
  id: "orders.lookup-tool",
  target: getOrder,
  description: "Read one order",
  sideEffect: "read",
  approval: "never",
});

export default lookupOrder;
