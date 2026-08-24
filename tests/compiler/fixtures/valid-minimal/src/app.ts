import { defineApp, defineEnv, env as envFactory } from "@zsys/app";

const env = defineEnv({ SERVICE_PORT: envFactory.port().default(3000) });
export default defineApp({ id: "minimal-app", env, providers: {} });
