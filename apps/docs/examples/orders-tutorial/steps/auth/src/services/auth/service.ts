/** Serves the tutorial's Better Auth instance at /api/auth against the sole database's native tables. */
import { defineBetterAuthService } from "@relkit/better-auth";
import { auth } from "./better-auth.js";

export default defineBetterAuthService({ auth });
