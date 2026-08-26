import { defineConfig, defineEnv, env as envFactory } from "@zsys/app";

const env = defineEnv({ SERVICE_PORT: envFactory.port().default(3000) });
export default defineConfig({ id: "warning-suffix-app", env });
