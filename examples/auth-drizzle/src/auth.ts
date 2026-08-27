import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { database, schema } from "@app/data/auth.data-model.js";

export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000",
  secret: process.env.BETTER_AUTH_SECRET ?? "development-only-auth-secret-32-characters",
  database: drizzleAdapter(database, { provider: "sqlite", schema }),
  emailAndPassword: { enabled: true },
});
