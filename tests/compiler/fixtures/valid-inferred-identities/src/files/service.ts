import { defineService } from "@relkit/app";
import readFiles from "./functions/read-files.function.js";

export default defineService({ functions: { readFiles } });
