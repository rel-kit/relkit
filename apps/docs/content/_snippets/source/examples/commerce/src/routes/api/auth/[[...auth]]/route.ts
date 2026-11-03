/** Mounts the native Better Auth handler once for all methods; each protected route sets auth: "required". */
import { defineRoute } from "@relkit/app/routes";
import auth from "../../../../services/auth/service.js";

export const ALL = defineRoute({
  // Forward every Better Auth method through one filesystem route.
  handler: auth.handler,
});
