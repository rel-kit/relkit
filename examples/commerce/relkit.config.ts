import "@relkit/pulumi";
import { defineApp, env as binding } from "@relkit/app/config";
import { aws } from "@relkit/aws";
import { docker } from "@relkit/docker";
import { inngest } from "@relkit/inngest";
import { otlp } from "@relkit/otlp";
import { redis, redisAgentState, redisRealtime } from "@relkit/redis";
import { s3 } from "@relkit/s3";
import { sentry } from "@relkit/sentry";
import env from "@app/platform/env.js";

export default defineApp({
  id: "commerce-api",
  env,
  // #region storage-profile
  bucket: {
    // #region storage-local-profile
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
    // #endregion storage-local-profile
    "agent-workspace": docker(
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
    // #region cache-local-profile
    requests: docker(redis({ url: binding.secret("REQUESTS_REDIS_URL") })),
    // #endregion cache-local-profile
    timeline: aws(redis(), { engine: "valkey", replicas: 1 }),
  },
  // #endregion cache-profile
  // #region realtime-profiles
  realtime: docker(redisRealtime({ url: binding.secret("REALTIME_REDIS_URL") })),
  "agent-state": {
    agents: docker(redisAgentState({ url: binding.secret("AGENT_STATE_REDIS_URL") })),
  },
  // #endregion realtime-profiles
  // #region jobs-profile
  jobs: { default: docker(inngest()) },
  defaults: {
    bucket: "assets",
    cache: "requests",
    realtime: "default",
    "agent-state": "agents",
    jobs: "default",
  },
  // #endregion jobs-profile
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
  // #region deployment-profile
  deployment: { engine: "pulumi", host: "aws" },
  // #endregion deployment-profile
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
