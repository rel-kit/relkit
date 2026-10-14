/** Maps profile GET requests to the account session function under the application auth mount's protection. */
import { defineRoute } from "@relkit/app/routes";
import account from "../../../services/account/service.js";

export const GET = defineRoute({ target: account.accountSession });
