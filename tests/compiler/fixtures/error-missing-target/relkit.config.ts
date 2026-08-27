import { defineConfig, defineEnv, env as envFactory } from "@relkit/app";

const env = defineEnv({ SERVICE_PORT: envFactory.port().default(3000) });
export default defineConfig({ id: "missing-target-app", env });
