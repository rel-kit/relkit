import { defineFunction } from "@zsys/app";
import { authorizationInput, authorizationOutput } from "../shared/schemas.js";

const authorizeOrder = defineFunction({
  input: authorizationInput,
  output: authorizationOutput,
  handler: async (input) => ({ allowed: input.authorization.startsWith("Bearer ") }),
});

export default authorizeOrder;
