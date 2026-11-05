import { defineEnv, env } from "relkit/config";

export default defineEnv({ DATABASE_PATH: env.string().default("./data-model.sqlite") });
