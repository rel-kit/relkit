/** Declares the data-model example's backend independently of inspection tools. */
import { defineApp } from "@relkit/app/config";
import env from "@app/platform/env.js";

export default defineApp({
  env,
  server: { port: 3000 },
});
