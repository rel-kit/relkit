import { defineConfig } from "@relkit/app/config";
import env from "@app/platform/env.js";

export default defineConfig({
  env,
  server: { port: 3000 },
  inspector: { port: 3210 },
});
