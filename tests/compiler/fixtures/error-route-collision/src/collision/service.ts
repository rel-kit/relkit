import { defineService } from "@relkit/app";
import getOrder from "./functions/get.function.js";

export default defineService({ functions: { getOrder } });
