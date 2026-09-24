import { defineEnv, env } from "../../src/index.js";

export const valueFreeDeclaration = defineEnv({
  apiKey: env.secret().default("fixture-secret-default"),
  mode: env.string().default("test"),
});
