import { defineRoute } from "@relkit/app/routes";
import session from "@app/functions/session.function.js";

export const GET = defineRoute({ target: session });
