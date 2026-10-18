import { defineBetterAuthService } from "@relkit/better-auth";

export { AuthenticationRequired, requireUser } from "./helpers/session.js";

export default defineBetterAuthService({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000",
  emailAndPassword: { enabled: true },
});
