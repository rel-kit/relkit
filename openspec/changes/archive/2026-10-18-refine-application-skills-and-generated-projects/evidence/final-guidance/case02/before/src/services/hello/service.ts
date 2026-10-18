import { defineService } from "@relkit/app/services";
import hello from "./functions/hello.function.js";
export default defineService({ functions: { hello } });
