import { defineRoute } from "@zsys/app";
import browsePath from "../../../functions/browse-path.function.js";

export const GET = defineRoute({ id: "docs.browse", target: browsePath });
