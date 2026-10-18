import { defineService } from "@relkit/app/services";
import health from "./functions/health.function.js";
export default defineService({ functions: { health } });
