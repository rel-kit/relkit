import { defineService } from "relkit";
import getOrder from "./functions/get-order.function.js";
import override from "./functions/override.function.js";

export default defineService({ functions: { getOrder, override } });
