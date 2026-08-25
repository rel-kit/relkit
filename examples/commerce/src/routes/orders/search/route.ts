import { defineRoute } from "@zsys/app";
import orders from "../../../services/orders.service.js";

export const GET = defineRoute({ target: orders.searchOrders });
