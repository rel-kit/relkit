/** Serves the commerce Better Auth instance at /api/auth without acquiring native clients at import. */
import { defineBetterAuthService } from "@relkit/better-auth";
import { auth } from "./better-auth.js";

export default defineBetterAuthService({ auth });
