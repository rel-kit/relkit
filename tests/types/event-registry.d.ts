import "@relkit/events";

declare global {
  namespace Relkit {
    interface EventRegistry {
      readonly "types.inference-event": (typeof import("./function-inference.js"))["orderCreated"];
      readonly "types.created": (typeof import("./descriptor-cohort.js"))["eventCreated"];
      readonly "types.changed": (typeof import("./descriptor-cohort.js"))["eventChanged"];
    }
  }
}

export {};
