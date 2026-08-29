import { defineEnv, env } from "@relkit/app/config";

export default defineEnv({ DATABASE_PATH: env.string().default(":memory:") });
