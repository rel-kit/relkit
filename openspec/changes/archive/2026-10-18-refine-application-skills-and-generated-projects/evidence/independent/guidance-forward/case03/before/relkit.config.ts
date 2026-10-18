import { defineApp } from "@relkit/app/config";
import env from "@app/platform/env.js";


export default defineApp({
  id: "transient-app",
  env,
  telemetry: { redaction: { mode: "development-redacted", maxBytes: 65_536 } },
  server: { port: 3000, maxBodyBytes: 1_048_576 },
  inspector: { port: 3210 },

});
