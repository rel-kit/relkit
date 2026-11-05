/**
 * Selects the Postgres backend for jobs, schedules and events. Both profiles
 * read the connection string from the DATABASE_URL secret and become the
 * defaults, so every job and event without an explicit profile uses them.
 */
import { defineApp, defineEnv, env } from "relkit/config";
import { postgresEvent, postgresJob } from "@relkit/postgres";

const appEnv = defineEnv({ DATABASE_URL: env.secret() });

export default defineApp({
  id: "orders",
  env: appEnv,
  jobs: { postgres: postgresJob({ url: env.secret("DATABASE_URL") }) },
  event: { postgres: postgresEvent({ url: env.secret("DATABASE_URL") }) },
  defaults: { jobs: "postgres", event: "postgres" },
});
