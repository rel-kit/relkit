import { defineService } from "@relkit/app/services";
import hello from "@app/hello/functions/hello.function.js";

export default defineService({ functions: { hello } });
