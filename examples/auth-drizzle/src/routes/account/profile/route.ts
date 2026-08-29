import { defineRoute } from "@relkit/app/routes";
import account from "@app/account/service.js";

export const GET = defineRoute({ target: account.session });
