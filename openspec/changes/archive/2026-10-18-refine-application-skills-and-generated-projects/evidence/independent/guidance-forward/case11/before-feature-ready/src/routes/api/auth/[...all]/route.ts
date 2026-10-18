import { defineRoute } from "@relkit/app/routes";
import auth from "@app/services/auth/service.js";
export const ALL = defineRoute({ handler: auth.handler });
