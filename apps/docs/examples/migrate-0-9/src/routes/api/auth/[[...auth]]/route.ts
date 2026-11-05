import { defineRoute } from "relkit/routes";
import auth from "../../../../services/auth/service.js";

export const ALL = defineRoute({
  handler: auth.handler,
});
