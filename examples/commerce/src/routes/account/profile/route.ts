import { defineRoute } from "@zsys/app";
import accountSession from "../../../functions/account-session.function.js";

export const GET = defineRoute({ target: accountSession });
