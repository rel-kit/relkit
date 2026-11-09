import type { EventDeliveryContract } from "./admin-contracts.js";
import type { EventRouterSnapshot } from "./router-types.js";
import { toDelivery } from "./admin-utils.js";

/** Locates a delivery in an inspector snapshot by its normalized identity.
 * @param snapshot - Immutable persisted or inspection snapshot.
 * @param deliveryId - Stable delivery identity.
 * @returns The matching delivery status, or undefined.
 */
export function findDelivery(
  snapshot: EventRouterSnapshot,
  deliveryId: string | undefined,
): EventDeliveryContract | undefined {
  return deliveryId === undefined
    ? undefined
    : snapshot.deliveries.map(toDelivery).find((delivery) => delivery.deliveryId === deliveryId);
}

/** Identifies deliveries in the terminal dead-letter state.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the delivery is dead-lettered.
 */
export function isDeadLetter(value: EventDeliveryContract): value is EventDeliveryContract & {
  readonly state: "dead-lettered";
  readonly failure: NonNullable<EventDeliveryContract["failure"]>;
} {
  return value.state === "dead-lettered" && value.failure !== undefined;
}
