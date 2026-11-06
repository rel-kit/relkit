import { defineEnv, env } from "../../../src/config/index.js";

export const valueFreeDeclaration = defineEnv({
  apiKey: env.secret().default("fixture-secret-default"),
  mode: env.string().default("test"),
});
