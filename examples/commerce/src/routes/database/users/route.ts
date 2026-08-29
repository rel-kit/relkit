import { defineRoute } from "@relkit/app/routes";
import users from "@app/users/service.js";

export const GET = defineRoute({ target: users.databaseUsers });
