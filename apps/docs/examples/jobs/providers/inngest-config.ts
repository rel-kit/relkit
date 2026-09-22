import { defineApp } from "@relkit/app/config";
import env from "@app/platform/env.js";
import { docker } from "@relkit/docker";
import { inngest } from "@relkit/inngest";

export default defineApp({
  id: "relkit-inngest",
  env,
  server: { port: 3000, maxBodyBytes: 1_048_576 },
  inspector: { port: 3210 },
  telemetry: { redaction: { mode: "development-redacted", maxBytes: 65_536 } },
  jobs: { default: docker(inngest()) },
  defaults: { jobs: "default" },
});
