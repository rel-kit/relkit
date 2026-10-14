/** Mounts native Better Auth once for all methods and protects both root and descendant order routes. */
import { defineRoute } from "@relkit/app/routes";
import auth from "@app/services/auth/service.js";

export const ALL = defineRoute({
  handler: auth.handler,
  auth: { protected: ["/orders", "/orders/*"] },
});
