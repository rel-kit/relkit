import { defineRoute } from "@relkit/app";
import health from "../health/service.js";

export const GET = defineRoute({ target: health.check });
