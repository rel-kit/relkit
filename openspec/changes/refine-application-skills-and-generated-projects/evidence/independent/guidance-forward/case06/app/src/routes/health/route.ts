import { defineRoute } from "@relkit/app/routes";
import health from "@app/services/health/service.js";
export const GET = defineRoute({ target: health.health });
