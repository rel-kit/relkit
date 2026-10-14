/** Maps session GET requests to account session observation, including the explicit anonymous result. */
import { defineRoute } from "@relkit/app/routes";
import account from "@app/services/account/service.js";

export const GET = defineRoute({ target: account.session });
