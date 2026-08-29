import { defineFunction } from "@relkit/app";
import { authInput, authOutput } from "../../platform/schemas.js";

const authorize = defineFunction({
  id: "orders.authorize",
  input: authInput,
  output: authOutput,
  handler: async (input) => ({ allowed: input.authorization.length > 0 }),
});

export default authorize;
