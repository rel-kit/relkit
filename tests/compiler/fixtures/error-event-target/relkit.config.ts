import { defineConfig, defineEnv, env, eventBridge, managed } from "@relkit/app";

export default defineConfig({
  id: "event-target-app",
  env: defineEnv({ SERVICE_PORT: env.port().default(3000) }),
  events: {
    default: managed(eventBridge({ region: "us-east-1", busName: "test-events" })),
  },
});
