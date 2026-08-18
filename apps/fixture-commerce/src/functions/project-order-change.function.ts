import { defineFunction } from "@zsys/app";
import { orderChangeEnvelope } from "../shared/schemas.js";

const projectOrderChange = defineFunction({
  id: "orders.project-change",
  input: orderChangeEnvelope,
  output: orderChangeEnvelope,
  handler: async (input) => input,
});

export default projectOrderChange;
