import { defineRoute } from "@relkit/app/routes";
import navigation from "@app/navigation/service.js";

export const GET = defineRoute({ target: navigation.browsePath });
