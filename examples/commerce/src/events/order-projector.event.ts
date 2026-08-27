import { events, onEvent } from "@relkit/app";

const orderProjector = onEvent(
  events.anyOf("orders.created", "orders.updated", "orders.cancelled"),
  async (envelope) => envelope,
  { id: "orders.project-any-change", profile: "default" },
);

export default orderProjector;
