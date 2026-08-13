import { defineEnv, env } from "../../../packages/config/src/index.ts";

export const valueFreeDeclaration = defineEnv({
  apiKey: env.secret().default("fixture-secret-default"),
  mode: env.string().default("test"),
});
