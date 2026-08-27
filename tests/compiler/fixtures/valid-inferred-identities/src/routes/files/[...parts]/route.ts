import { defineRoute } from "@relkit/app";
import readFiles from "../../../functions/files/read-files.function.js";

export const GET = defineRoute({ target: readFiles });
