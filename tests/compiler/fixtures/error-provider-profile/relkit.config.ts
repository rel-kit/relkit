import { defineConfig, defineEnv, env, external, s3 } from "@relkit/app";

export default defineConfig({
  id: "provider-profile-app",
  env: defineEnv({ SERVICE_PORT: env.port().default(3000) }),
  buckets: {
    default: external(
      s3({
        endpoint: new URL("http://127.0.0.1:9000"),
        bucketName: "archive",
        region: "us-east-1",
      }),
    ),
  },
});
