import { defineChannel } from "relkit/realtime";
import { s } from "relkit/schema";

const orderUpdates = defineChannel({
  id: "orders.updates",
  params: s.object({ orderId: s.string() }),
  events: { placed: s.object({ totalCents: s.number() }) },
  client: { public: true },
});

export default orderUpdates;
