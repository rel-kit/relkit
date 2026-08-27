import type { UnknownEventEnvelope } from "@relkit/events";

export const DEFAULT_EPHEMERAL_CAPACITY = 100;
export const EPHEMERAL_DELIVERY_CAPABILITIES = Object.freeze({
  persistence: "none",
  restartRecovery: false,
  dropPolicy: "drop-newest",
} as const);

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

export interface EphemeralDelivery {
  readonly deliver: (envelope: UnknownEventEnvelope) => Promise<EphemeralDeliveryResult>;
  readonly snapshot: () => EphemeralDeliverySnapshot;
}

/** Delivers transient events while bounding simultaneous in-process work. */
export function createEphemeralDelivery(
  invoke: (envelope: UnknownEventEnvelope) => Promise<unknown>,
  requestedCapacity = DEFAULT_EPHEMERAL_CAPACITY,
): EphemeralDelivery {
  if (typeof invoke !== "function") throw new TypeError("Ephemeral delivery requires a target");
  if (!Number.isSafeInteger(requestedCapacity) || requestedCapacity <= 0) {
    throw new RangeError("Ephemeral delivery capacity must be a positive integer");
  }
  const capacity = requestedCapacity;
  let inFlight = 0;
  let admitted = 0;
  let completed = 0;
  let failed = 0;
  let dropped = 0;

  const deliver = async (envelope: UnknownEventEnvelope): Promise<EphemeralDeliveryResult> => {
    // ponytail: no hidden backlog; add a bounded FIFO only if measured delivery needs it.
    if (inFlight >= capacity) {
      dropped += 1;
      return outcome({ accepted: false, status: "dropped", dropReason: "capacity" });
    }
    inFlight += 1;
    admitted += 1;
    try {
      const value = await invoke(envelope);
      completed += 1;
      return outcome({ accepted: true, status: "completed", value });
    } catch (error) {
      failed += 1;
      return outcome({ accepted: true, status: "failed", error });
    } finally {
      inFlight -= 1;
    }
  };
  const snapshot = (): EphemeralDeliverySnapshot =>
    Object.freeze({
      capacity,
      inFlight,
      admitted,
      completed,
      failed,
      dropped,
      ...EPHEMERAL_DELIVERY_CAPABILITIES,
    });
  return Object.freeze({ deliver, snapshot });

  function outcome(
    result: Pick<EphemeralDeliveryResult, "accepted" | "status"> &
      Partial<Pick<EphemeralDeliveryResult, "value" | "error" | "dropReason">>,
  ): EphemeralDeliveryResult {
    return Object.freeze({
      ...result,
      persisted: false,
      capacity,
      dropPolicy: "drop-newest",
      restartRecovery: false,
    });
  }
}
