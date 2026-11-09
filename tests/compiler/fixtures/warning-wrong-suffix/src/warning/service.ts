import { defineService } from "relkit";
import warningSuffix from "./functions/wrong-suffix.js";

export default defineService({ functions: { warningSuffix } });
