/** Realtime channel with one event. */
import { defineChannel } from "relkit/realtime";
import { s } from "relkit/schema";

export default defineChannel({
  id: "orders.updates",
  params: s.object({ orderId: s.string() }),
  events: { "status.changed": s.object({ orderId: s.string(), status: s.string() }) },
  client: { public: true },
  presence: "count",
});
