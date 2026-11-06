/** A plain Better Auth file as the templates write it, imported while the evaluator watches. */
import { betterAuth } from "better-auth";
import { defineBetterAuthService } from "../../src/index.ts";

export const auth = betterAuth({
  // The server refuses to start without BETTER_AUTH_URL; the fallback only serves `relkit check`.
  baseURL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: true },
});

export default defineBetterAuthService({ auth });
