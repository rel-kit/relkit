import { defineFunction } from "@relkit/app";
import { authorizationInput, authorizationOutput } from "@app/shared/schemas.js";

const authorizeOrder = defineFunction({
  input: authorizationInput,
  output: authorizationOutput,
  handler: async (input) => ({ allowed: input.authorization.startsWith("Bearer ") }),
});

export default authorizeOrder;
