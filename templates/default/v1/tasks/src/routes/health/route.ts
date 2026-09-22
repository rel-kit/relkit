import { defineRoute } from "@relkit/app/routes";
import orders from "@app/orders/service.js";

export const GET = defineRoute({ target: orders.health });
