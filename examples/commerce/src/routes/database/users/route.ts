import { defineRoute } from "@relkit/app/routes";
import databaseUsers from "@app/functions/database-users.function.js";

export const GET = defineRoute({ target: databaseUsers });
