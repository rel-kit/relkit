/** Mounts native Better Auth once for all methods and protects the declared account, order and MCP paths. */
import { defineRoute } from "@relkit/app/routes";
import auth from "@app/services/auth/service.js";

export const ALL = defineRoute({
  handler: auth.handler,
  auth: { protected: ["/account/*", "/orders/*", "/mcp"] },
});
