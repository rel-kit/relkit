/** Mounts native Better Auth once for all methods; each protected route sets auth: "required". */
import { defineRoute } from "@relkit/app/routes";
import auth from "@app/services/auth/service.js";

export const ALL = defineRoute({ handler: auth.handler });
