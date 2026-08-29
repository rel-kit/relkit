import { defineService } from "@relkit/app/services";
import accountSession from "./functions/account-session.function.js";

export default defineService({ functions: { accountSession } });
