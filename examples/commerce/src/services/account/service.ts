/** Declares the account service boundary without acquiring native clients. */
import { defineService } from "relkit/services";
import accountSession from "./functions/account-session.function.js";

export default defineService({ functions: { accountSession } });
