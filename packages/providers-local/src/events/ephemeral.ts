import type {
  EphemeralDeliveryResult,
  EphemeralDeliverySnapshot,
  EphemeralDelivery,
  EphemeralDeliveryEffects,
} from "./ephemeral.types.js";
import { Context, Effect, Layer, Option, Ref, Semaphore } from "effect";
import {
  localOperation,
  localPromise,
  localSync,
  runLocal,
  runLocalSync,
} from "../local-effect.js";
import type { UnknownEventEnvelope } from "@relkit/events";

export type {
  EphemeralDeliveryResult,
  EphemeralDeliverySnapshot,
  EphemeralDelivery,
  EphemeralDeliveryEffects,
} from "./ephemeral.types.js";

export const DEFAULT_EPHEMERAL_CAPACITY = 100;
export const EPHEMERAL_DELIVERY_CAPABILITIES = Object.freeze({
  persistence: "none",
  restartRecovery: false,
  dropPolicy: "drop-newest",
} as const);

/** Capacity, counters and native handler completion share one service owner. */
export class LocalEphemeralService extends Context.Service<
  LocalEphemeralService,
  EphemeralDeliveryEffects
>()("@relkit/providers-local/Ephemeral") {}

/**
 * Constructs a transient delivery service behind the Promise boundary.
 * @param invoke - Handler invoked for admitted events.
 * @param requestedCapacity - Maximum simultaneous handlers; overflow is dropped.
 * @returns Delivery, safe counters and an explicit drain operation.
 */
export function createEphemeralDelivery(
  invoke: (envelope: UnknownEventEnvelope) => Promise<unknown>,
  requestedCapacity = DEFAULT_EPHEMERAL_CAPACITY,
): EphemeralDelivery {
  const service = runLocalSync(makeEphemeralDelivery(invoke, requestedCapacity));
  return Object.freeze({
    deliver: (envelope: UnknownEventEnvelope) => runLocal(service.deliver(envelope)),
    drain: () => runLocal(service.drain()),
    snapshot: () => runLocalSync(service.snapshot()),
  });
}

/**
 * Supplies transient delivery and drains admitted handlers at scope exit.
 * @param invoke - Handler boundary.
 * @param capacity - Maximum concurrent admissions.
 * @returns A layer implementing the same delivery contract as test substitutes.
 */
export function ephemeralDeliveryLayer(
  invoke: (envelope: UnknownEventEnvelope) => Promise<unknown>,
  capacity = DEFAULT_EPHEMERAL_CAPACITY,
) {
  return Layer.effect(
    LocalEphemeralService,
    Effect.acquireRelease(makeEphemeralDelivery(invoke, capacity), (service) => service.drain()),
  );
}

/**
 * Owns bounded admission and safe counters using Ref and Semaphore.
 * @param invoke - Native handler; its Promise is joined because it exposes no abort channel.
 * @param capacity - Positive maximum number of simultaneous handlers.
 * @returns The lazily constructed delivery service.
 */
export const makeEphemeralDelivery = Effect.fn("Ephemeral.create")(function* (
  invoke: (envelope: UnknownEventEnvelope) => Promise<unknown>,
  capacity = DEFAULT_EPHEMERAL_CAPACITY,
) {
  yield* localSync(() => {
    if (typeof invoke !== "function") throw new TypeError("Ephemeral delivery requires a target");
    if (!Number.isSafeInteger(capacity) || capacity <= 0)
      throw new RangeError("Ephemeral delivery capacity must be a positive integer");
  });
  const permits = yield* Semaphore.make(capacity);
  const counters = yield* Ref.make({
    inFlight: 0,
    admitted: 0,
    completed: 0,
    failed: 0,
    dropped: 0,
  });
  /**
   * Adds explicit nonpersistent capacity guarantees to a transient handler result.
   * @param result - Handler completion, failure or overflow result.
   * @returns The immutable ephemeral delivery result.
   */
  const outcome = (
    result: Pick<EphemeralDeliveryResult, "accepted" | "status"> &
      Partial<Pick<EphemeralDeliveryResult, "value" | "error" | "dropReason">>,
  ): EphemeralDeliveryResult =>
    Object.freeze({
      ...result,
      persisted: false,
      capacity,
      dropPolicy: "drop-newest",
      restartRecovery: false,
    });
  /**
   * Admits a transient handler without a backlog and releases its capacity on completion.
   * @param envelope - Validated event envelope.
   * @returns A lazy effect yielding completion, failure or drop-newest overflow.
   */
  const deliver = Effect.fn("Ephemeral.deliver")(
    function* (envelope: UnknownEventEnvelope) {
      const result = yield* permits.withPermitsIfAvailable(1)(
        Effect.gen(function* () {
          yield* Ref.update(counters, (value) => ({
            ...value,
            admitted: value.admitted + 1,
            inFlight: value.inFlight + 1,
          }));
          const exit = yield* Effect.result(localPromise(() => invoke(envelope)));
          yield* Ref.update(counters, (value) => ({
            ...value,
            completed: value.completed + (exit._tag === "Success" ? 1 : 0),
            failed: value.failed + (exit._tag === "Failure" ? 1 : 0),
          }));
          return exit._tag === "Success"
            ? outcome({ accepted: true, status: "completed", value: exit.success })
            : outcome({ accepted: true, status: "failed", error: exit.failure.cause });
        }).pipe(
          Effect.ensuring(
            Ref.update(counters, (value) => ({ ...value, inFlight: value.inFlight - 1 })),
          ),
          Effect.uninterruptible,
        ),
      );
      if (Option.isSome(result)) return result.value;
      yield* Ref.update(counters, (value) => ({ ...value, dropped: value.dropped + 1 }));
      return outcome({ accepted: false, status: "dropped", dropReason: "capacity" });
    },
    (effect) => localOperation("Ephemeral.deliver", effect),
  );
  return LocalEphemeralService.of({
    deliver,
    drain: () => localOperation("Ephemeral.drain", permits.withPermits(capacity)(Effect.void)),
    snapshot: () =>
      localOperation(
        "Ephemeral.snapshot",
        Effect.map(Ref.get(counters), (value) =>
          Object.freeze({ capacity, ...value, ...EPHEMERAL_DELIVERY_CAPABILITIES }),
        ),
      ),
  });
});
