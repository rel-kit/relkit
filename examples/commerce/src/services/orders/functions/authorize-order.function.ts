/** Supplies order middleware with a validated demonstration check for the Bearer authorization prefix. */
import { defineFunction } from "@relkit/app/functions";
import { authorizationInput, authorizationOutput } from "../../../platform/schemas.js";

const authorizeOrder = defineFunction({
  input: authorizationInput,
  output: authorizationOutput,
  handler: async (input) => ({ allowed: input.authorization.startsWith("Bearer ") }),
});

export default authorizeOrder;
