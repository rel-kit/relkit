/** The commerce example's Better Auth instance, with development-only values. RelKit adds the database and mounts it. */
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  baseURL: "http://127.0.0.1:3000",
  secret: "development-only-auth-secret-32-characters",
});
