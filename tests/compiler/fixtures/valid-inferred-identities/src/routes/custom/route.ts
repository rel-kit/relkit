import { defineRoute } from "relkit";
import health from "../../health/service.js";

export const POST = defineRoute({ id: "health.custom-route", target: health.check });
