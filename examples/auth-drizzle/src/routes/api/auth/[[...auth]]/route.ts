import { defineRoute } from "@relkit/app/routes";
import auth from "@app/auth/service.js";

export const ALL = defineRoute({
  handler: auth.handler,
  auth: { protected: ["/account/*", "/orders/*", "/mcp"] },
});
