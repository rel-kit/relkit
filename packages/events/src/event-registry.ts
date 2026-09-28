import type { InferOutput } from "@relkit/schema";
import type { EventDescriptorAny } from "./define-event.js";

declare global {
  namespace Relkit {
    /** Augmented by `.relkit/generated/event-registry.d.ts` for application event names. */
    interface EventRegistry {}
  }
}

/** Application registry augmented by generated event declarations.
 * @example type Events = EventRegistry
 */
export type EventRegistry = Relkit.EventRegistry;

/** Event IDs known to the generated application registry.
 * @example type Id = EventName
 */
export type EventName = Extract<keyof EventRegistry, string>;

/** Resolves a registered event descriptor from its name.
 * @example type Created = EventDescriptorByName<"orders.created">
 */
export type EventDescriptorByName<Name extends EventName> =
  EventRegistry[Name] extends EventDescriptorAny ? EventRegistry[Name] : never;

/** Decoded payload for a registered event name.
 * @example type Payload = EventInputByName<"orders.created">
 */
export type EventInputByName<Name extends EventName> = InferOutput<
  EventDescriptorByName<Name>["input"]
>;

/** Version of a registered event contract.
 * @example type Version = EventVersionByName<"orders.created">
 */
export type EventVersionByName<Name extends EventName> = EventDescriptorByName<Name>["version"];
