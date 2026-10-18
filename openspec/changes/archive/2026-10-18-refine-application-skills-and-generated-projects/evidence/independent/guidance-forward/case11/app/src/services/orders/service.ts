import { defineService } from "@relkit/app/services";
import create from "./functions/create.function.js";
import list from "./functions/list.function.js";
export default defineService({ functions: { create, list } });
