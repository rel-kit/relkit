import { defineRoute } from "@relkit/app";
import session from "../../functions/session.function.js";

export const GET = defineRoute({ target: session });
