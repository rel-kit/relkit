import { defineTool } from "@relkit/app";
import getOrder from "../functions/get-order.function.js";

export default defineTool({
  target: getOrder,
  description: "Look up one order",
  sideEffect: "read",
  approval: "never",
});
