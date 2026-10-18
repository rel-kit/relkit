import { defineRoute } from "@relkit/app/routes";
import users from "@app/services/users/service.js";
export const GET = defineRoute({ target: users.profile });
