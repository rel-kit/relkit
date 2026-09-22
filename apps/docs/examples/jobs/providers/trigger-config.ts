import { defineApp } from "@relkit/app/config";
import env from "@app/platform/env.js";
import { docker } from "@relkit/docker";
import { trigger } from "@relkit/trigger";

export default defineApp({
  id: "relkit-trigger",
  env,
  server: { port: 3000, maxBodyBytes: 1_048_576 },
  inspector: { port: 3210 },
  telemetry: { redaction: { mode: "development-redacted", maxBytes: 65_536 } },
  jobs: { default: docker(trigger()) },
  defaults: { jobs: "default" },
});
