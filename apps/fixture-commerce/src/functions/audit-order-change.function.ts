import { defineFunction } from "@zsys/app";
import { orderChangeEnvelope } from "../shared/schemas.js";

const auditOrderChange = defineFunction({
  id: "orders.audit-change",
  input: orderChangeEnvelope,
  output: orderChangeEnvelope,
  handler: async (input) => input,
});

export default auditOrderChange;
