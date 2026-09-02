import "@relkit/pulumi";
import { aiSdk } from "@relkit/ai-sdk";
import { defineApp, env as binding } from "@relkit/app/config";
import { aws } from "@relkit/aws";
import { docker } from "@relkit/docker";
import { otlp } from "@relkit/otlp";
import { redis } from "@relkit/redis";
import { s3 } from "@relkit/s3";
import { sentry } from "@relkit/sentry";
import env from "@app/platform/env.js";

export default defineApp({
  id: "commerce-api",
  env,
  // #region storage-profile
  bucket: {
    assets: docker(
      s3({
        endpoint: binding.url("ASSETS_S3_ENDPOINT"),
        bucketName: binding.string("ASSETS_S3_BUCKET"),
        region: binding.string("ASSETS_S3_REGION"),
        credentials: {
          accessKeyId: binding.secret("ASSETS_S3_ACCESS_KEY_ID"),
          secretAccessKey: binding.secret("ASSETS_S3_SECRET_ACCESS_KEY"),
        },
        forcePathStyle: true,
      }),
    ),
    receipts: aws(s3({ signedUrlTtlSeconds: 300 }), { versioning: true }),
  },
  // #endregion storage-profile
  // #region cache-profile
  cache: {
    requests: docker(redis({ url: binding.secret("REQUESTS_REDIS_URL") })),
    timeline: aws(redis(), { engine: "valkey", replicas: 1 }),
  },
  // #endregion cache-profile
  // #region ai-profile
  model: {
    openai: aiSdk({
      provider: "openai",
      defaultModel: "gpt-5-mini",
      apiKey: binding.secret("OPENAI_API_KEY"),
    }),
  },
  // #endregion ai-profile
  defaults: {
    bucket: "assets",
    cache: "requests",
    model: "openai",
  },
  // #region telemetry
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
  // #endregion telemetry
  deployment: { engine: "pulumi", host: "aws" },
  server: {
    port: 4000,
    maxBodyBytes: 1_048_576,
    apiDocs: {
      enabledInProduction: false,
      excludeDomains: ["database", "navigation", "telemetry", "auth"],
    },
  },
  inspector: { port: 4001 },
});
