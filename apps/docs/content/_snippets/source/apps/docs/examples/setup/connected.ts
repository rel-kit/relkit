/** Local Docker recipes pair with explicit connected resource values for release builds. */
import { defineApp, defineEnv, env as binding } from "@relkit/app/config";
import { docker } from "@relkit/docker";
import { redis } from "@relkit/redis";
import { s3 } from "@relkit/s3";

export default defineApp({
  env: defineEnv({}),
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
  },
  cache: { requests: docker(redis({ url: binding.secret("REQUESTS_REDIS_URL") })) },
  defaults: { bucket: "assets", cache: "requests" },
});
