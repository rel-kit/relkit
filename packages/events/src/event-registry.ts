import type { InferOutput } from "@relkit/schema";
import type { EventDescriptorAny } from "./define-event.js";

/** Augmented by `.relkit/generated/event-registry.d.ts` for application event names. */
export interface EventRegistry {}

export type EventName = Extract<keyof EventRegistry, string>;

export type EventDescriptorByName<Name extends EventName> =
  EventRegistry[Name] extends EventDescriptorAny ? EventRegistry[Name] : never;

export type EventPayloadByName<Name extends EventName> = InferOutput<
  EventDescriptorByName<Name>["payload"]
>;

export type EventVersionByName<Name extends EventName> = EventDescriptorByName<Name>["version"];
