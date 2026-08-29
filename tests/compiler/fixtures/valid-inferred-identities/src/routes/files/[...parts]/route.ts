import { defineRoute } from "@relkit/app";
import files from "../../../files/service.js";

export const GET = defineRoute({ target: files.readFiles });
