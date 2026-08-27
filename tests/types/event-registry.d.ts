import "@relkit/events";

declare module "@relkit/events" {
  interface EventRegistry {
    readonly "types.created": (typeof import("./descriptor-cohort.js"))["eventCreated"];
    readonly "types.changed": (typeof import("./descriptor-cohort.js"))["eventChanged"];
  }
}

export {};
