import type orderCreated from "./events/order-created.event.js";

declare global {
  namespace Relkit {
    interface EventRegistry {
      "orders.created": typeof orderCreated;
    }
  }
}

export {};
