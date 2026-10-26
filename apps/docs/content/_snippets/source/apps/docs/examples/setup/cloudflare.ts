/** Connect existing R2 and KV resources without selecting Cloudflare application hosting. */
import { defineApp, defineEnv, env as binding } from "@relkit/app/config";
import { kv, r2 } from "@relkit/cloudflare";

export default defineApp({
  env: defineEnv({}),
  bucket: {
    assets: r2({
      accountId: binding.string("CLOUDFLARE_ACCOUNT_ID"),
      bucketName: binding.string("R2_BUCKET_NAME"),
      credentials: {
        accessKeyId: binding.secret("R2_ACCESS_KEY_ID"),
        secretAccessKey: binding.secret("R2_SECRET_ACCESS_KEY"),
      },
    }),
  },
  cache: {
    requests: kv({
      accountId: binding.string("CLOUDFLARE_ACCOUNT_ID"),
      namespaceId: binding.string("KV_NAMESPACE_ID"),
      apiToken: binding.secret("CLOUDFLARE_API_TOKEN"),
    }),
  },
  defaults: { bucket: "assets", cache: "requests" },
});
