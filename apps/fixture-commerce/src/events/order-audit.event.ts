import { events, onEvent } from "@zsys/app";
import auditOrderChange from "../functions/audit-order-change.function.js";

const orderAudit = onEvent(events.match("orders.*"), {
  id: "orders.audit-changes",
  target: auditOrderChange,
  delivery: "durable",
  profile: "default",
});

export default orderAudit;
