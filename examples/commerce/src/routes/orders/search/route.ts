import { defineRoute } from "@relkit/app/routes";
import orders from "@app/services/orders.service.js";

export const GET = defineRoute({ target: orders.searchOrders });
