import type { EventDeliveryContract } from "./admin-contracts.js";
import type { EventRouterSnapshot } from "./router-types.js";
import { toDelivery } from "./admin-utils.js";

export function findDelivery(
  snapshot: EventRouterSnapshot,
  deliveryId: string | undefined,
): EventDeliveryContract | undefined {
  return deliveryId === undefined
    ? undefined
    : snapshot.deliveries.map(toDelivery).find((delivery) => delivery.deliveryId === deliveryId);
}

export function isDeadLetter(value: EventDeliveryContract): value is EventDeliveryContract & {
  readonly state: "dead-lettered";
  readonly failure: NonNullable<EventDeliveryContract["failure"]>;
} {
  return value.state === "dead-lettered" && value.failure !== undefined;
}
