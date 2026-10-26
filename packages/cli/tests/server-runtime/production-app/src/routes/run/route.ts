/** Exposes the production proof submission function through the fixture's POST route. */
import { defineRoute } from "@relkit/app/routes";
import probe from "../../services/probe/service.js";

export const POST = defineRoute({ id: "probe.route", target: probe.submit });
