import { defineService } from "relkit";
import getOrder from "./functions/get-order.function.js";

export default defineService({ functions: { getOrder } });
