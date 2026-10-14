/** Maps required file path segments to the navigation function's inferred input contract. */
import { defineRoute } from "@relkit/app/routes";
import navigation from "../../../services/navigation/service.js";

export const GET = defineRoute({ target: navigation.browsePath });
