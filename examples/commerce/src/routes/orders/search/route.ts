import { defineRoute } from "@zsys/app";
import searchOrders from "../../../functions/search-orders.function.js";

export const GET = defineRoute({ id: "orders.search.http", target: searchOrders });
