import { defineService } from "@relkit/app";
import warningSuffix from "./functions/wrong-suffix.js";

export default defineService({ functions: { warningSuffix } });
