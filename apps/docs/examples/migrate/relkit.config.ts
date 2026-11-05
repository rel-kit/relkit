/** Declares the migrated Orders API used by the "Migrate from Express or Hono" guide. */
import { defineApp } from "relkit/config";
import env from "./src/platform/env.js";

export default defineApp({
  env,
  server: { port: 3000 },
});
