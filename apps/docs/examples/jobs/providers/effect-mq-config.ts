import { defineApp } from "@relkit/app/config";
import env from "@app/platform/env.js";
import { docker } from "@relkit/docker";
import { effectMq } from "@relkit/effect-mq";

export default defineApp({
  id: "relkit-effect-mq",
  env,
  server: { port: 3000, maxBodyBytes: 1_048_576 },
  inspector: { port: 3210 },
  telemetry: { redaction: { mode: "development-redacted", maxBytes: 65_536 } },
  jobs: { default: docker(effectMq()) },
  defaults: { jobs: "default" },
});
