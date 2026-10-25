/** HTTP needs listener settings but no external provider or custom PORT field. */
import { defineApp, defineEnv } from "@relkit/app/config";

export default defineApp({
  env: defineEnv({}),
  server: { port: 3000, maxBodyBytes: 1_048_576 },
});
