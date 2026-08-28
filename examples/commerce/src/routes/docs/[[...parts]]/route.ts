import { defineRoute } from "@relkit/app/routes";
import browsePath from "@app/functions/browse-path.function.js";

export const GET = defineRoute({ target: browsePath });
