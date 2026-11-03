import { defineService } from "relkit";
import getOrder from "./functions/get.function.js";

export default defineService({ functions: { getOrder } });
