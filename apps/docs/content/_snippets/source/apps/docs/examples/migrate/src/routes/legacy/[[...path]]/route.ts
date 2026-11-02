/** Serves every /legacy request from the existing Hono app until its endpoints move. */
import { defineRoute } from "@relkit/app/routes";
import legacy from "../../../legacy/app.js";

export const ALL = defineRoute({ handler: (request) => legacy.fetch(request) });
