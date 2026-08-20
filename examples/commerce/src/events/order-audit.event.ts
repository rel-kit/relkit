import { events, onEvent } from "@zsys/app";

const orderAudit = onEvent(events.match("orders.*"), async (envelope) => envelope, {
  id: "orders.audit-changes",
  profile: "default",
});

export default orderAudit;
