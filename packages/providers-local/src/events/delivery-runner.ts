import type { DeliveryRunnerOptions } from "./delivery.service.types.js";
import { Effect, Option } from "effect";
import { localOperation, localPromise } from "../local-effect.js";
import { applyRetry, safeFailureMetadata } from "../jobs/retry.js";
import { normalizeEnvelope } from "./router-records.js";
import { promoteDue, records, resultFrom } from "./delivery-utils.js";
import type { EventDeliveryEffects } from "./delivery.service.types.js";

/**
 * Builds bounded handler execution over an already recovered durable queue.
 * @param owner - Trigger dependencies and the provider-owned execution semaphore.
 * @returns A lazy runNext operation that acknowledges success only after durable completion.
 */
export function makeDeliveryRunner(owner: DeliveryRunnerOptions): EventDeliveryEffects["runNext"] {
  const { queue, store, binding, triggerId, executions, retryPolicy, clock, options, ensureOpen } =
    owner;
  /**
   * Runs one eligible durable delivery and commits its attempt outcome.
   * @param deliveryId - Durable delivery identity.
   * @returns The delivery outcome, or undefined when there is no eligible work.
   */
  const runNext: EventDeliveryEffects["runNext"] = Effect.fn("EventDelivery.runNext")(
    function* (deliveryId?: string) {
      yield* ensureOpen();
      const result = yield* executions.withPermitsIfAvailable(1)(
        Effect.gen(function* () {
          yield* localPromise(() => queue.recover(clock()));
          yield* localPromise(() => promoteDue(queue, clock));
          const candidate = deliveryId === undefined ? undefined : queue.get(deliveryId);
          if (
            deliveryId !== undefined &&
            (candidate === undefined || candidate.state !== "available")
          )
            return undefined;
          const leased = yield* localPromise(() => queue.acquire(deliveryId));
          if (leased === undefined) return undefined;
          const duplicate = leased.attempt > 1;
          // This callback has no AbortSignal; join it and finish acknowledgement before release.
          return yield* Effect.gen(function* () {
            const invoked = yield* Effect.result(
              localPromise(() =>
                binding.invoke(normalizeEnvelope(leased.input), {
                  attempt: leased.attempt,
                  replayed: store
                    .snapshot()
                    .records.some(
                      (record) =>
                        record.instanceId === leased.instanceId && record.kind === "dead-lettered",
                    ),
                  ...(binding.timeoutMs === undefined ? {} : { timeoutMs: binding.timeoutMs }),
                }),
              ),
            );
            if (invoked._tag === "Failure") {
              const error = invoked.failure.cause;
              const entry = yield* localPromise(() =>
                applyRetry(queue, leased.instanceId, retryPolicy, error, {
                  now: clock,
                  ...(options.random === undefined ? {} : { random: options.random }),
                }),
              );
              return resultFrom(
                entry,
                triggerId,
                duplicate,
                "failed",
                error,
                safeFailureMetadata(error),
              );
            }
            yield* localPromise(async () => {
              await options.onBoundary?.("handler-success-before-ack");
            });
            const entry = yield* localPromise(() =>
              queue.transition(leased.instanceId, "completed", { expectedState: "leased" }),
            );
            return resultFrom(
              entry,
              triggerId,
              duplicate,
              "completed",
              undefined,
              undefined,
              invoked.success,
            );
          }).pipe(Effect.uninterruptible);
        }),
      );
      return Option.isSome(result) ? result.value : undefined;
    },
    (effect) => localOperation("EventDelivery.runNext", effect),
  );
  return runNext;
}
