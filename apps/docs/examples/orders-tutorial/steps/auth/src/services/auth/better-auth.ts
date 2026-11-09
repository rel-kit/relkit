/** The tutorial's Better Auth instance: email and password sign-in. RelKit adds the database and mounts it. */
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  // The server refuses to start without BETTER_AUTH_URL; the fallback only serves `relkit check`.
  baseURL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000",
  emailAndPassword: { enabled: true },
});
