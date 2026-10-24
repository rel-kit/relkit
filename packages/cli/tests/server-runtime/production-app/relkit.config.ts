/** Selects local durable jobs and production Scalar rendering for canonical JavaScript closure acceptance. */
import { defineApp, defineEnv } from "@relkit/app/config";
import { localJob } from "@relkit/local";

export default defineApp({
  id: "production-closure",
  env: defineEnv({}),
  jobs: { default: localJob() },
  defaults: { jobs: "default" },
  server: { apiDocs: { ui: "scalar", enabledInProduction: true } },
});
