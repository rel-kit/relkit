import { defineService } from "@relkit/app";
import first from "./functions/first.function.js";
import second from "./functions/second.function.js";

export default defineService({ functions: { first, second } });
