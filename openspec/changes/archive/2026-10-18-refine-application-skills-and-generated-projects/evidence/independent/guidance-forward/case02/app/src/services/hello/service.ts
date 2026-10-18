/** Declares the hello service boundary and its public members. */
import { defineService } from "@relkit/app/services";
import hello from "@app/services/hello/functions/hello.function.js";

export default defineService({ functions: { hello } });
