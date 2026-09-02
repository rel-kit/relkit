import { defineApp, defineEnv } from "@relkit/app/config";
import { docker } from "@relkit/integrations/docker";
import { redis } from "@relkit/integrations/redis";

export default defineApp({
  env: defineEnv({}),
  cache: docker(redis()),
});
