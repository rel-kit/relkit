/** Declares backend defaults; inspection remains disabled unless explicitly enabled. */
import { defineApp } from "@relkit/app/config";
import env from "@app/platform/env.js";
// relkit:create:deployment-imports

export default defineApp({
  env,
  telemetry: { redaction: { mode: "development-redacted", maxBytes: 65_536 } },
  server: { port: 3000, maxBodyBytes: 1_048_576 },
  // relkit:create:deployment
});
