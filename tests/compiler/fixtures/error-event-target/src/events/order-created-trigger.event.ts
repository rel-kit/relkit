import { onEvent } from "@zsys/app";
import handleEvent from "../functions/handle-event.function.js";
import orderCreated from "./order-created.event.js";

const trigger = onEvent(orderCreated, {
  id: "orders.created-trigger",
  target: handleEvent,
  delivery: "durable",
});

export default trigger;
