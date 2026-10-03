import type {
  EventDeliveryCapabilities,
  EventDeliveryBoundary,
  EventDeliveryInvocationOptions,
  EventDeliveryBinding,
  EventDeliveryOptions,
  EventDeliveryResult,
  EventDeliveryLedgerRecord,
  EventDeliverySnapshot,
  EventDelivery,
} from "./delivery.types.js";
export type {
  EventDeliveryCapabilities,
  EventDeliveryBoundary,
  EventDeliveryInvocationOptions,
  EventDeliveryBinding,
  EventDeliveryOptions,
  EventDeliveryResult,
  EventDeliveryLedgerRecord,
  EventDeliverySnapshot,
  EventDelivery,
} from "./delivery.types.js";

export const EVENT_DELIVERY_CAPABILITIES = Object.freeze({
  persistence: "restart-recovery",
  restartRecovery: true,
  atLeastOnce: true,
  exactlyOnce: false,
  ordering: "unsupported",
  orderedByKey: false,
} as const);
