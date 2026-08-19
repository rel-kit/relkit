import { events, onEvent } from "@zsys/app";
import projectOrderChange from "../functions/project-order-change.function.js";
import orderCancelled from "./order-cancelled.event.js";
import orderCreated from "./order-created.event.js";
import orderUpdated from "./order-updated.event.js";

const orderProjector = onEvent(events.anyOf(orderCreated, orderUpdated, orderCancelled), {
  id: "orders.project-any-change",
  target: projectOrderChange,
  delivery: "durable",
  profile: "default",
});

export default orderProjector;
