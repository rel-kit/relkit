/** Local Redis supplies the connection for the requests cache profile. */
import { defineApp, defineEnv } from "@relkit/app/config";
import { docker } from "@relkit/docker";
import { redis } from "@relkit/redis";

export default defineApp({
  env: defineEnv({}),
  cache: { requests: docker(redis()) },
  defaults: { cache: "requests" },
});
