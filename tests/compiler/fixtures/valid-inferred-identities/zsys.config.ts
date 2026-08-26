import { aiSdk, defineConfig, defineEnv, env as envFactory, external } from "@zsys/app";

const env = defineEnv({
  SERVICE_PORT: envFactory.port().default(3000),
  MODEL_API_KEY: envFactory.secret().optional(),
});

export default defineConfig({
  id: "inferred-app",
  env,
  models: {
    default: external(
      aiSdk({
        defaultProvider: "openai",
        defaultModel: "gpt-5-mini",
        openai: { apiKey: env.MODEL_API_KEY },
      }),
    ),
  },
});
