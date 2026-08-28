import { defineRoute } from "@relkit/app/routes";
import accountSession from "@app/functions/account-session.function.js";

export const GET = defineRoute({ target: accountSession });
