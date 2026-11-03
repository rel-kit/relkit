import { defineService } from "relkit";
import sayHello from "./functions/hello.function.js";

export default defineService({ functions: { sayHello } });
