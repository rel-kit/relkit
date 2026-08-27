import { defineRoute } from "@relkit/app";
import listUsers from "@app/functions/list-users.function.js";

export const GET = defineRoute({ target: listUsers });
