import { defineService } from "@relkit/app/services";
import session from "./functions/session.function.js";

export default defineService({ functions: { session } });
