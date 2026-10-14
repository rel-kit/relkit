/** Declares email/password Better Auth using the configured URL and the sole database owner's native tables. */
import { defineBetterAuthService } from "@relkit/better-auth";

export default defineBetterAuthService({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000",
  emailAndPassword: { enabled: true },
});
