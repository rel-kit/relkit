/** Maps a report path identifier to the order stream and exposes its validated items as server-sent events. */
import { defineRoute, http } from "@relkit/app/routes";
import orders from "../../../services/orders/service.js";

export const GET = defineRoute({
  target: orders.streamOrderReport,
  request: http.input({ reportId: http.path("reportId") }),
  client: { operation: "query" },
  stream: { format: "sse" },
});
