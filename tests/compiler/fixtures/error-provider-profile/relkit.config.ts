import { defineApp, defineEnv, env } from "@relkit/app";
import { s3 } from "@relkit/s3";

export default defineApp({
  id: "provider-profile-app",
  env: defineEnv({ SERVICE_PORT: env.port().default(3000) }),
  bucket: {
    default: s3({
      endpoint: new URL("http://127.0.0.1:9000"),
      bucketName: "archive",
      region: "us-east-1",
    }),
  },
});
