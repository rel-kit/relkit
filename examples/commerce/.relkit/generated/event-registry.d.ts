import "@relkit/events";

declare module "@relkit/events" {
  interface EventRegistry {
    readonly "orders.cancelled": typeof import("../../src/orders/events/order-cancelled.event.js")["default"];
    readonly "orders.created": typeof import("../../src/orders/events/order-created.event.js")["default"];
    readonly "orders.updated": typeof import("../../src/orders/events/order-updated.event.js")["default"];
  }
}

export {};
