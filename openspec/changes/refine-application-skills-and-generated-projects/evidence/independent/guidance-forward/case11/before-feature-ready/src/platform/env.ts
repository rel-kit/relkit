import { defineEnv } from "@relkit/app/config";
export default defineEnv({ DATABASE_PATH: env.string().default("./.relkit/state/app.sqlite") });
