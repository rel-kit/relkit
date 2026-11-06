/** Maps profile GET requests to the account session function; a session is required. */
import { defineRoute } from "relkit/routes";
import account from "../../../services/account/service.js";

export const GET = defineRoute({ target: account.accountSession, auth: "required" });
