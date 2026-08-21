import { awsProviders, defineApp, localProviders, testProviders } from "@zsys/app";
import env from "./env.js";

export default defineApp({
  id: "my-app",
  env,
  providers: {
    development: localProviders({
      stateDirectory: ".zsys/state",
      observabilityDirectory: ".zsys/observability",
    }),
    test: testProviders({
      deterministicIds: true,
      deterministicClock: true,
    }),
    production: awsProviders({
      region: env.AWS_REGION,
      modelProviders: {
        defaultProvider: "openai",
        defaultModel: "gpt-5-mini",
        openai: { apiKey: env.OPENAI_API_KEY },
        anthropic: {
          defaultModel: "claude-sonnet-4-5",
          apiKey: env.ANTHROPIC_API_KEY,
        },
      },
    }),
  },
  observability: { bodyCapture: { mode: "off" } },
});
