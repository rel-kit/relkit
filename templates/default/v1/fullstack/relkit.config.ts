import { defineApp } from "@relkit/app/config";
import { localAgentState, localRealtime } from "@relkit/local";
import env from "@app/platform/env.js";
// relkit:create:deployment-imports

export default defineApp({
  env,
  realtime: localRealtime(),
  "agent-state": localAgentState(),
  defaults: { realtime: "default", "agent-state": "default" },
  telemetry: { redaction: { mode: "development-redacted", maxBytes: 65_536 } },
  server: { port: 3000, maxBodyBytes: 1_048_576 },
  inspector: { port: 3210 },
  // relkit:create:deployment
});
