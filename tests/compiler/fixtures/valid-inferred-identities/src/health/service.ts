import { defineService } from "@relkit/app";
import check from "./functions/health.function.js";

export default defineService({ functions: { check } });
