/** The application's Better Auth instance. RelKit adds the database and mounts it. */
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000",
  emailAndPassword: { enabled: true },
});
