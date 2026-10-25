/** Channels use Docker Redis by default during local development. */
import { defineApp, defineEnv } from "@relkit/app/config";
import { docker } from "@relkit/docker";
import { redisRealtime } from "@relkit/redis";

export default defineApp({
  env: defineEnv({}),
  realtime: docker(redisRealtime()),
  defaults: { realtime: "default" },
});
