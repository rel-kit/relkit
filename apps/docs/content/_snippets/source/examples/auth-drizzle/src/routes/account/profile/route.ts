/** Maps protected profile GET requests to the account service's native session observation. */
import { defineRoute } from "@relkit/app/routes";
import account from "@app/services/account/service.js";

export const GET = defineRoute({ target: account.session });
