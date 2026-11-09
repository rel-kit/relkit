import { defineRoute } from "relkit/routes";
import orders from "../../../services/orders/service.js";

export const GET = defineRoute({ target: orders.getOrder, auth: "required" });
