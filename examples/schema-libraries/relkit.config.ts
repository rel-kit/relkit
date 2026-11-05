/** Declares an app whose contracts use Zod 4, ArkType, Valibot and Effect Schema side by side. */
import { defineApp } from "relkit/config";
import { localEvent, localJob } from "@relkit/local";
import env from "@app/platform/env.js";

export default defineApp({
  env,
  server: { port: 3000 },
  event: localEvent(),
  jobs: localJob(),
  defaults: { event: "default", jobs: "default" },
});
