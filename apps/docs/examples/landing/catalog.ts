/** Demonstrates a Redis cache selected through its standalone Docker integration. */
import { defineApp, defineEnv } from "@relkit/app/config";
import { docker } from "@relkit/docker";
import { redis } from "@relkit/redis";

export default defineApp({
  env: defineEnv({}),
  cache: docker(redis()),
});
