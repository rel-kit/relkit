import { defineRoute } from "@zsys/app";
import health from "../../functions/health.function.js";

export const POST = defineRoute({ id: "health.custom-route", target: health });
