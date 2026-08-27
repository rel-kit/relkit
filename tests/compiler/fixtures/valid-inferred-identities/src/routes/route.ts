import { defineRoute } from "@relkit/app";
import health from "../functions/health.function.js";

export const GET = defineRoute({ target: health });
