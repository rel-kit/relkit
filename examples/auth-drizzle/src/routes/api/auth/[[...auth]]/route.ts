import { defineRoute } from "@relkit/app";
import { betterAuthAdapter } from "@relkit/better-auth";
import { auth } from "@app/auth.js";

export const ALL = defineRoute({
  handler: betterAuthAdapter(auth, { protected: ["/account/*", "/orders/*", "/mcp"] }),
});
