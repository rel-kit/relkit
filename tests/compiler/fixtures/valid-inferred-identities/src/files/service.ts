import { defineService } from "relkit";
import readFiles from "./functions/read-files.function.js";

export default defineService({ functions: { readFiles } });
