import { defineService } from "@relkit/app/services";
import current from "./functions/current.function.js";

export default defineService({ functions: { current } });
