import { defineTool } from "@zsys/app";
import getOrder from "../functions/orders/get-order.function.js";

export default defineTool({
  target: getOrder,
  description: "Look up one order",
  sideEffect: "read",
  approval: "never",
});
