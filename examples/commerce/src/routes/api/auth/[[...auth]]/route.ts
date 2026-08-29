import { defineRoute } from "@relkit/app/routes";
import auth from "@app/auth/service.js";

export const ALL = defineRoute({
  // Forward every Better Auth method through one filesystem route.
  // Only the listed application paths require an authenticated session.
  handler: auth.handler,
  auth: { protected: ["/account/*", "/mcp"] },
});
