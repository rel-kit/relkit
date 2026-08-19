import { awsProviders, defineApp, localProviders, testProviders } from "@zsys/app";
import env from "./env.js";

export default defineApp({
  id: "my-app",
  env,
  providers: {
    development: localProviders({
      stateDirectory: ".zsys/state",
      observabilityDirectory: ".zsys/observability",
      models: { default: { provider: "scripted" } },
    }),
    test: testProviders({
      deterministicIds: true,
      deterministicClock: true,
      models: { default: { provider: "scripted" } },
    }),
    production: awsProviders({
      region: env.AWS_REGION,
      models: { default: { provider: "openai", apiKey: env.OPENAI_API_KEY } },
    }),
  },
  observability: { bodyCapture: { mode: "off" } },
});
