import { defineApp, defineEnv, env as envFactory } from "@relkit/app";
import { docker } from "@relkit/docker";
import { redis } from "@relkit/redis";
import { s3 } from "@relkit/s3";

const env = defineEnv({
  SERVICE_PORT: envFactory.port().default(3000),
});

export default defineApp({
  id: "full-app",
  env,
  bucket: {
    default: s3({
      endpoint: "https://s3.us-east-1.amazonaws.com",
      bucketName: "assets",
      region: "us-east-1",
    }),
  },
  cache: { default: docker(redis({ url: envFactory.secret("CACHE_URL") })) },
  defaults: {
    bucket: "default",
    cache: "default",
  },
  telemetry: { redaction: { mode: "off" } },
});
