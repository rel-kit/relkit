import { onEvent } from "@zsys/app";
import handleOrderCreated from "../functions/handle-order-created.function.js";
import orderCreated from "./order-created.event.js";

const orderReceipt = onEvent(orderCreated, {
  id: "receipts.on-order-created",
  target: handleOrderCreated,
  delivery: "durable",
  profile: "default",
  retry: {
    maxAttempts: 3,
    initialDelayMs: 500,
    maxDelayMs: 10_000,
    multiplier: 2,
    jitter: "none",
  },
  concurrency: 4,
});

export default orderReceipt;
