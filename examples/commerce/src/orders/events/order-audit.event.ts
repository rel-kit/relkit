import { events, onEvent } from "@relkit/app/events";

const orderAudit = onEvent(events.match("orders.*"), async (envelope) => envelope, {
  id: "orders.audit-changes",
  profile: "default",
});

export default orderAudit;
