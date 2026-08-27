import { defineRoute } from "@relkit/app";
import databaseUsers from "@app/functions/database-users.function.js";

export const GET = defineRoute({ target: databaseUsers });
