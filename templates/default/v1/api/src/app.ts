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
    test: testProviders({ deterministicIds: true, deterministicClock: true }),
    production: awsProviders({ region: env.AWS_REGION }),
  },
  observability: { bodyCapture: { mode: "off" } },
});
