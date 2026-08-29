import { defineFunction } from "@relkit/app";
import { emptyInput, orderOutput } from "../../platform/schemas.js";

const health = defineFunction({
  id: "health.check",
  input: emptyInput,
  output: orderOutput,
  handler: async () => ({ orderId: "health", ok: true }),
});

export default health;
