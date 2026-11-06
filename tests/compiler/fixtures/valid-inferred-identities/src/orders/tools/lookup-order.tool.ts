import { defineTool } from "relkit";
import getOrder from "../functions/get-order.function.js";

export default defineTool({
  target: getOrder,
  description: "Look up one order",
  sideEffect: "read",
  approval: "never",
});
