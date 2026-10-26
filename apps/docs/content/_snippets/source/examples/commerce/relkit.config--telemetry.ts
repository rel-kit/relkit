telemetry: {
  redaction: { mode: "development-redacted", maxBytes: 65_536 },
  localRetention: { maxRecords: 2_000, maxAgeMs: 3_600_000, maxBytes: 16_777_216 },
  exportSampling: { traceRate: 0.25, minimumLogLevel: "info" },
  exporters: {
    errors: sentry({
      dsn: binding.secret("SENTRY_DSN"),
      environment: binding.string("SENTRY_ENVIRONMENT"),
    }),
    traces: otlp({
      endpoint: binding.url("OTLP_ENDPOINT"),
      headers: { authorization: binding.secret("OTLP_AUTHORIZATION") },
      serviceName: "commerce-api",
    }),
  },
},
