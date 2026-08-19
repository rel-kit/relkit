import { onEvent } from "@zsys/app";
import handleCreated from "../functions/handle-created.function.js";
import orderCreated from "./order-created.event.js";

const listener = onEvent(orderCreated, {
  id: "orders.listener",
  target: handleCreated,
  delivery: "durable",
  profile: "default",
  retry: {
    maxAttempts: 2,
    initialDelayMs: 1,
    maxDelayMs: 5,
    multiplier: 2,
    jitter: "none",
  },
});

export default listener;
