import { defineService } from "relkit";
import first from "./functions/first.function.js";
import second from "./functions/second.function.js";

export default defineService({ functions: { first, second } });
