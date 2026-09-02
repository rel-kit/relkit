import { defineApp, defineEnv, env as binding } from "@relkit/app/config";
import { otlp } from "@relkit/otlp";
import { sentry } from "@relkit/sentry";

export default defineApp({
  env: defineEnv({}),
  telemetry: {
    redaction: { mode: "development-redacted", maxBytes: 65_536 },
    localRetention: { maxRecords: 2_000, maxAgeMs: 3_600_000 },
    exportSampling: { traceRate: 0.25, minimumLogLevel: "info" },
    exporters: {
      errors: sentry({ dsn: binding.secret("SENTRY_DSN") }),
      traces: otlp({ endpoint: binding.url("OTLP_ENDPOINT") }),
    },
  },
});
