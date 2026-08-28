# @relkit/app

`@relkit/app` is the public entry point for application configuration, descriptors, and composable
provider bindings. `relkit.config.ts` contains settings and provider profiles; database and auth are
registered by their own discovered descriptors.

```ts
import { defineConfig, defineEnv, env, external, redis, s3 } from "@relkit/app/config";

const values = defineEnv({
  BUCKET_ENDPOINT: env.url(),
  BUCKET_NAME: env.string(),
  BUCKET_REGION: env.string(),
  BUCKET_ACCESS_KEY_ID: env.secret().optional(),
  BUCKET_SECRET_ACCESS_KEY: env.secret().optional(),
  CACHE_URL: env.secret(),
});

export default defineConfig({
  env: values,
  buckets: {
    assets: external(
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
  caches: { primary: external(redis({ url: values.CACHE_URL })) },
  defaults: { bucket: "assets", cache: "primary" },
  server: { port: 3000 },
  inspector: { port: 3210 },
});
```

Use MinIO and Redis values locally, R2 and Upstash values in a hosted pipeline, or `managed()` S3 and
Valkey bindings with an AWS deployment. `external()` resources are never provisioned and receive no
deployment IAM statements. Secret adapter fields require secret environment references.

`id` defaults to the normalized `package.json.name`. `PORT` and `RELKIT_ENV` are framework-reserved.
Hosting remains in `relkit.config.ts`:

```ts
export default defineConfig({
  deployment: { target: "aws", adapter: "pulumi" },
  server: { port: 3000 },
  inspector: { port: 3210 },
});
```
