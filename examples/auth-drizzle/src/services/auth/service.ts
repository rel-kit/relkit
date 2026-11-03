/** Serves the application's Better Auth instance at /api/auth against the sole Drizzle database. */
import { defineBetterAuthService } from "@relkit/better-auth";
import { auth } from "./better-auth.js";

export default defineBetterAuthService({ auth });
