import type { InferOutput } from "@relkit/schema";
import type { EventDescriptorAny } from "./define-event.js";

declare global {
  namespace Relkit {
    /** Augmented by `.relkit/generated/event-registry.d.ts` for application event names. */
    interface EventRegistry {}
  }
}

export type EventRegistry = Relkit.EventRegistry;

export type EventName = Extract<keyof EventRegistry, string>;

export type EventDescriptorByName<Name extends EventName> =
  EventRegistry[Name] extends EventDescriptorAny ? EventRegistry[Name] : never;

export type EventInputByName<Name extends EventName> = InferOutput<
  EventDescriptorByName<Name>["input"]
>;

export type EventVersionByName<Name extends EventName> = EventDescriptorByName<Name>["version"];
