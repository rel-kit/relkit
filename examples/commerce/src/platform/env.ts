import { defineEnv, env as envFactory } from "@relkit/app/config";

const env = defineEnv({
  APP_ENV: envFactory.literal("development", "test", "production").default("development"),
  DATABASE_PATH: envFactory.string().default(".relkit/commerce.sqlite"),
  BETTER_AUTH_SECRET: envFactory.secret().default("development-only-auth-secret-32-characters"),
});

export default env;
