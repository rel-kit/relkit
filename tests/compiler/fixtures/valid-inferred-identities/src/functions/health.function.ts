import { defineFunction } from "@zsys/app";
import { emptyInput, orderOutput } from "../shared/schemas.js";

const health = defineFunction({
  id: "health.check",
  input: emptyInput,
  output: orderOutput,
  handler: async () => ({ orderId: "health", ok: true }),
});

export default health;
