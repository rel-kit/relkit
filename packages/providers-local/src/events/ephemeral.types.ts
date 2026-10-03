import type { Effect } from "effect";
import type { UnknownEventEnvelope } from "@relkit/events";

/** Transient handler outcome with explicit nonpersistent capacity guarantees. */
export interface EphemeralDeliveryResult {
  readonly accepted: boolean;
  readonly persisted: false;
  readonly status: "completed" | "failed" | "dropped";
  readonly capacity: number;
  readonly dropPolicy: "drop-newest";
  readonly restartRecovery: false;
  readonly value?: unknown;
  readonly error?: unknown;
  readonly dropReason?: "capacity";
}

/** Safe admission, completion, failure and overflow counters. */
export interface EphemeralDeliverySnapshot {
  readonly capacity: number;
  readonly inFlight: number;
  readonly admitted: number;
  readonly completed: number;
  readonly failed: number;
  readonly dropped: number;
  readonly persistence: "none";
  readonly restartRecovery: false;
  readonly dropPolicy: "drop-newest";
}

/** Public transient delivery interface with explicit drain and synchronous counters. */
export interface EphemeralDelivery {
  readonly deliver: (envelope: UnknownEventEnvelope) => Promise<EphemeralDeliveryResult>;
  readonly drain: () => Promise<void>;
  readonly snapshot: () => EphemeralDeliverySnapshot;
}

/** Effect contract for bounded transient delivery without a hidden backlog. */
export interface EphemeralDeliveryEffects {
  readonly deliver: (envelope: UnknownEventEnvelope) => Effect.Effect<EphemeralDeliveryResult>;
  readonly drain: () => Effect.Effect<void>;
  readonly snapshot: () => Effect.Effect<EphemeralDeliverySnapshot>;
}
