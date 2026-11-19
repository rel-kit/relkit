/** Better Auth instance and its RelKit service. */
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins/organization";
import { defineBetterAuthService } from "@relkit/better-auth";
import { ac, roles } from "./permissions.js";

export const auth = betterAuth({
  baseURL: "http://127.0.0.1:4000",
  secret: "fixture-only-secret-fixture-only-secret",
  emailAndPassword: { enabled: true },
  plugins: [organization({ ac, roles, creatorRole: "owner" })],
});

export default defineBetterAuthService({ auth });
