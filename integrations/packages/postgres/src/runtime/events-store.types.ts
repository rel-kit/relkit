/** Row shape returned when a consumer leases an event delivery. */
import type { UnknownEventEnvelope } from "relkit/events";

/** A leased delivery joined with its outbox envelope. */
export interface DeliveryRow {
  readonly instance_id: string;
  readonly trigger_id: string;
  /** One-based attempt this lease runs. */
  readonly attempt: number;
  readonly envelope: UnknownEventEnvelope;
}
