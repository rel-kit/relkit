import { defineApp, defineEnv, env as envFactory } from "@relkit/app";

const env = defineEnv({ SERVICE_PORT: envFactory.port().default(3000) });
export default defineApp({ id: "collision-app", env });
