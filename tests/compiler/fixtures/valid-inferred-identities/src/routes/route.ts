import { defineRoute } from "relkit";
import health from "../health/service.js";

export const GET = defineRoute({ target: health.check });
