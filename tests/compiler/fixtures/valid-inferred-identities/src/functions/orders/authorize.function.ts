import { defineFunction } from "@zsys/app";
import { authInput, authOutput } from "../../shared/schemas.js";

const authorize = defineFunction({
  input: authInput,
  output: authOutput,
  handler: async (input) => ({ allowed: input.authorization.length > 0 }),
});

export default authorize;
