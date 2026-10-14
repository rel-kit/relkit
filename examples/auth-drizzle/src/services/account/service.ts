/** Exposes native session observation as the account boundary used by profile and session routes. */
import { defineService } from "@relkit/app/services";
import session from "./functions/session.function.js";

export default defineService({ functions: { session } });
