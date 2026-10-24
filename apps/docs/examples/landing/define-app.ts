/** Declares the landing backend example with inspection disabled by default. */
import { defineApp, defineEnv } from "@relkit/app/config";

export default defineApp({
  id: "commerce-api",
  env: defineEnv({}),
  telemetry: { redaction: { mode: "off" } },
  server: { port: 3000 },
});
