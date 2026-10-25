/** Agent checkpoints and live updates use separate Docker Redis capabilities. */
import { defineApp, defineEnv } from "@relkit/app/config";
import { docker } from "@relkit/docker";
import { redisAgentState, redisRealtime } from "@relkit/redis";

export default defineApp({
  env: defineEnv({}),
  realtime: docker(redisRealtime()),
  "agent-state": docker(redisAgentState()),
  defaults: { realtime: "default", "agent-state": "default" },
});
