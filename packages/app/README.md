# @zsys/app

`@zsys/app` is the public entry point for value-free application descriptors and composable provider
bindings. Applications declare one topology; deployment pipelines provide different values for the
same environment schema.

```ts
import { defineApp, defineEnv, env, external, redis, s3 } from "@zsys/app";

const values = defineEnv({
  BUCKET_ENDPOINT: env.url(),
  BUCKET_NAME: env.string(),
  BUCKET_REGION: env.string(),
  BUCKET_ACCESS_KEY_ID: env.secret().optional(),
  BUCKET_SECRET_ACCESS_KEY: env.secret().optional(),
  CACHE_URL: env.secret(),
});

export default defineApp({
  id: "orders-app",
  env: values,
  providers: {
    buckets: {
      default: external(
        s3({
          endpoint: values.BUCKET_ENDPOINT,
          bucketName: values.BUCKET_NAME,
          region: values.BUCKET_REGION,
          credentials: {
            accessKeyId: values.BUCKET_ACCESS_KEY_ID,
            secretAccessKey: values.BUCKET_SECRET_ACCESS_KEY,
          },
        }),
      ),
    },
    cache: { default: external(redis({ url: values.CACHE_URL })) },
  },
});
```

Use MinIO and Redis values locally, R2 and Upstash values in a hosted pipeline, or `managed()` S3 and
Valkey bindings with an AWS deployment. `external()` resources are never provisioned and receive no
deployment IAM statements. Secret adapter fields require secret environment references.

`PORT` and `ZSYS_ENV` are framework-reserved. Hosting belongs in `zsys.config.ts`:

```ts
export default defineConfig({
  deployment: { target: "aws", adapter: "pulumi" },
  server: { port: 3000 },
  inspector: { port: 3210 },
});
```
