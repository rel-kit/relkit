import { defineRoute } from "@relkit/app";
import browsePath from "../../../functions/browse-path.function.js";

export const GET = defineRoute({ target: browsePath });
