import { defineApp, defineEnv } from "@relkit/app/config";

export default defineApp({
  id: "commerce-api",
  env: defineEnv({}),
  telemetry: { redaction: { mode: "off" } },
  server: { port: 3000 },
  inspector: { port: 3210 },
});
