import { aiSdk } from "@relkit/ai-sdk";
import { defineApp, defineEnv, env as envFactory } from "@relkit/app";

const env = defineEnv({
  SERVICE_PORT: envFactory.port().default(3000),
});

export default defineApp({
  id: "inferred-app",
  env,
  model: {
    openai: aiSdk({
      provider: "openai",
      defaultModel: "gpt-5-mini",
      apiKey: envFactory.secret("MODEL_API_KEY"),
    }),
  },
});
