import { Effect, Ref } from "effect";
import type { ActivationRecord } from "./activation.types.js";
import type { ActivationPublicationState } from "./activation-publish.types.js";
import type { SupervisorTelemetry, SupervisorTelemetryListener } from "./state-machine.types.js";

/**
 * Commits evidence before ordered fanout, including reentrant native listeners.
 * @param records - One committed activation decision.
 * @param events - Retained lifecycle history.
 * @param listeners - Current native evidence borrowers.
 * @param publications - Per-owner temporary publication queue.
 * @returns Synchronous completion; listener failures cannot roll back state or skip another listener.
 */
export function publishActivation(
  records: readonly ActivationRecord[],
  events: Ref.Ref<readonly SupervisorTelemetry[]>,
  listeners: Ref.Ref<ReadonlySet<SupervisorTelemetryListener>>,
  publications: Ref.Ref<ActivationPublicationState>,
): Effect.Effect<void> {
  return Effect.gen(function* () {
    const committed = yield* Ref.modify(events, (current) => {
      const additions = records.map((record, index) =>
        Object.freeze({
          ...record,
          sequence: current.length + index + 1,
        }),
      );
      return [additions, [...current, ...additions]] as const;
    });
    const consumers = yield* Ref.get(listeners);
    const own = yield* Ref.modify(publications, (current) => [
      !current.publishing,
      {
        publishing: true,
        pending: [...current.pending, { records: committed, listeners: consumers }],
      },
    ]);
    if (!own) return;
    while (true) {
      const batch = yield* Ref.modify(publications, (current) => [
        current.pending[0],
        {
          publishing: current.pending.length > 0,
          pending: current.pending.slice(1),
        },
      ]);
      if (batch === undefined) return;
      yield* Effect.sync(() => {
        for (const record of batch.records)
          for (const listener of batch.listeners) {
            try {
              listener(record);
            } catch {
              /* A sink has no state authority. */
            }
          }
      });
    }
  });
}
