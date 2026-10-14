/** Declares the navigation service boundary without acquiring native clients. */
import { defineService } from "@relkit/app/services";
import browsePath from "./functions/browse-path.function.js";

export default defineService({ functions: { browsePath } });
