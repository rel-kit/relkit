import { defineApp, defineEnv, env as binding } from "@relkit/app/config";
import { docker } from "@relkit/docker";
import { redis } from "@relkit/redis";

export default defineApp({
  env: defineEnv({}),
  cache: {
    requests: docker(redis({ url: binding.secret("REQUESTS_REDIS_URL") })),
    timeline: docker(redis()),
  },
  defaults: { cache: "requests" },
});
