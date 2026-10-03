import type { EventDelivery } from "./delivery.js";
import type { EventRouterTrigger } from "./router-types.js";
import type { EphemeralDelivery } from "./ephemeral.js";

/** Safe registered-trigger fields used by inspection projection. */
export interface RegisteredTriggerView {
  readonly binding: EventRouterTrigger;
  readonly durable?: EventDelivery;
  readonly ephemeral?: EphemeralDelivery;
}
