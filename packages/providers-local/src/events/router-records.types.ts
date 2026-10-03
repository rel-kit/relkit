import type { UnknownEventEnvelope } from "@relkit/events";
import type { EVENT_DELIVERY_VERSION } from "./router-records.js";

/** Durable acceptance record connecting one publication and trigger. */
export interface EventDeliveryRecord {
  readonly version: typeof EVENT_DELIVERY_VERSION;
  readonly sequence: number;
  readonly timestamp: number;
  readonly deliveryId: string;
  readonly eventInstanceId: string;
  readonly triggerId: string;
  readonly envelope: UnknownEventEnvelope;
}

/** Versioned persisted delivery identity and canonical envelope payload. */
export interface DeliveryData {
  readonly version: typeof EVENT_DELIVERY_VERSION;
  readonly deliveryId: string;
  readonly eventInstanceId: string;
  readonly triggerId: string;
  readonly envelope: UnknownEventEnvelope;
}
