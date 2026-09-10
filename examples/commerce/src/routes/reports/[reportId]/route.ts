import { defineRoute, http } from "@relkit/app/routes";
import orders from "@app/orders/service.js";

export const GET = defineRoute({
  target: orders.streamOrderReport,
  request: http.input({ reportId: http.path("reportId") }),
  client: { operation: "query" },
  stream: { format: "sse" },
});
