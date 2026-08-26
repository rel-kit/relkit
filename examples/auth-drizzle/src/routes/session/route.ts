import { defineRoute } from "@zsys/app";
import session from "../../functions/session.function.js";

export const GET = defineRoute({ target: session });
