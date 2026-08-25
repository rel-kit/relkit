import { defineApp, defineEnv, env } from "@zsys/app";

export default defineApp({
  id: "provider-profile-app",
  env: defineEnv({ SERVICE_PORT: env.port().default(3000) }),
  providers: {},
});
