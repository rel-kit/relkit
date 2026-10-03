import { runLocal, runLocalSync } from "../local-effect.js";
import { EVENT_DELIVERY_CAPABILITIES } from "./delivery-types.js";
import type { EventDelivery } from "./delivery.types.js";
import type { EventDeliveryEffects } from "./delivery.service.types.js";

/**
 * Projects the owned delivery service into its existing Promise/synchronous contract.
 * @param service - Recovered durable delivery owner.
 * @returns Compatibility methods preserving errors and configured caller context.
 */
export function promiseDelivery(service: EventDeliveryEffects): EventDelivery {
  return Object.freeze<EventDelivery>({
    triggerId: service.triggerId,
    capabilities: EVENT_DELIVERY_CAPABILITIES,
    accept: (input) => runLocal(service.accept(input)),
    deliver: (input) => runLocal(service.deliver(input)),
    runNext: (id) => runLocal(service.runNext(id)),
    retry: (id) => runLocal(service.retry(id)),
    recover: (now) => runLocal(service.recover(now)),
    drain: () => runLocal(service.drain()),
    snapshot: () => runLocalSync(service.snapshot()),
    close: () => runLocal(service.close()),
  });
}
