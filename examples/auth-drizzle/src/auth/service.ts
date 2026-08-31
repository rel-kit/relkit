import { defineBetterAuthService } from "@relkit/better-auth";

export default defineBetterAuthService({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000",
  // Better Auth reads BETTER_AUTH_SECRET from the server process environment.
  emailAndPassword: { enabled: true },
});
