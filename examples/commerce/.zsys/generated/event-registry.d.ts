import "@zsys/events";

declare module "@zsys/events" {
  interface EventRegistry {
    readonly "orders.cancelled": typeof import("../../src/events/order-cancelled.event.js")["default"];
    readonly "orders.created": typeof import("../../src/events/order-created.event.js")["default"];
    readonly "orders.updated": typeof import("../../src/events/order-updated.event.js")["default"];
  }
}

export {};
