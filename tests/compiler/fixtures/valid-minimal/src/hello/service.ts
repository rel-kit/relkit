import { defineService } from "@relkit/app";
import sayHello from "./functions/hello.function.js";

export default defineService({ functions: { sayHello } });
