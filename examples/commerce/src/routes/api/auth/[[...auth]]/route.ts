import { defineRoute } from "@relkit/app/routes";
import { betterAuthAdapter } from "@relkit/better-auth";
import { auth } from "@app/auth.js";

export const ALL = defineRoute({
  // Forward every Better Auth method through one filesystem route.
  // Only the listed application paths require an authenticated session.
  handler: betterAuthAdapter(auth, { protected: ["/account/*", "/mcp"] }),
});
