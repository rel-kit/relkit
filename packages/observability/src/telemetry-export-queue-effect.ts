import { Context, Effect, Layer, Schema } from "effect";
import { isRedactedObservabilityRecord } from "./record-admission.js";
import { observeTelemetryExportQueueOperation as observed } from "./telemetry-export-queue-metrics.js";
import type {
  TelemetryExportQueueEffects,
  TelemetryExportQueueOptions,
  TelemetryExportQueueStats,
  TelemetryExportUnit,
} from "./telemetry-export-queue.types.js";

/**
 * A rejected queue configuration or export unit.
 *
 * @example
 * Effect.runSync(makeBoundedTelemetryExportQueueEffect({ maxRecords: 0 }).pipe(
 *   Effect.catchTag("TelemetryExportQueueError", (error) => Effect.succeed(error.reason)),
 * ));
 */
export class TelemetryExportQueueError extends Schema.TaggedError<TelemetryExportQueueError>()(
  "TelemetryExportQueueError",
  {
    reason: Schema.Literals(["maxRecords", "unit"]),
    message: Schema.String,
  },
) {}

/**
 * Injectable queue capability for Effect callers.
 *
 * @example
 * const program = Effect.gen(function* () {
 *   const queue = yield* TelemetryExportQueueService;
 *   return yield* queue.stats();
 * });
 */
export class TelemetryExportQueueService extends Context.Service<
  TelemetryExportQueueService,
  TelemetryExportQueueEffects
>()("@relkit/observability/TelemetryExportQueue") {}

function invalid(reason: "maxRecords" | "unit"): TelemetryExportQueueError {
  return new TelemetryExportQueueError({
    reason,
    message:
      reason === "maxRecords"
        ? "Telemetry export queue maxRecords must be a positive safe integer"
        : "Telemetry export unit is invalid",
  });
}

function normalize(
  value: TelemetryExportUnit,
): Effect.Effect<TelemetryExportUnit, TelemetryExportQueueError> {
  return Effect.gen(function* () {
    if (
      value === null ||
      typeof value !== "object" ||
      typeof value.id !== "string" ||
      value.id === "" ||
      !Array.isArray(value.records) ||
      value.records.length === 0 ||
      value.records.some((record) => !isRedactedObservabilityRecord(record))
    )
      return yield* Effect.fail(invalid("unit"));
    return Object.freeze({ id: value.id, records: Object.freeze([...value.records]) });
  });
}

/**
 * Creates a queue whose complete behavior runs through Effect.
 *
 * @param options - Queue capacity and overflow policy.
 * @returns An Effect producing queue operations or a typed configuration error.
 * @example
 * const queue = Effect.runSync(makeBoundedTelemetryExportQueueEffect({ maxRecords: 8 }));
 * Effect.runSync(queue.stats());
 */
export const makeBoundedTelemetryExportQueueEffect = Effect.fn("ObservabilityExportQueue.create")(
  function* (options: TelemetryExportQueueOptions) {
    return yield* observed(
      "create",
      Effect.gen(function* () {
        const maximum = options.maxRecords;
        if (!Number.isSafeInteger(maximum) || maximum < 1)
          return yield* Effect.fail(invalid("maxRecords"));
        const overflow = options.overflow ?? "drop-oldest";
        const units: TelemetryExportUnit[] = [];
        let receivedRecords = 0;
        let queuedRecords = 0;
        let droppedRecords = 0;
        let droppedUnits = 0;

        const drop = (unit: TelemetryExportUnit): void => {
          droppedRecords += unit.records.length;
          droppedUnits += 1;
        };
        const enqueue = Effect.fn("ObservabilityExportQueue.enqueue")(function* (
          input: TelemetryExportUnit,
        ) {
          return yield* observed(
            "enqueue",
            Effect.gen(function* () {
              const incoming = yield* normalize(input);
              receivedRecords += incoming.records.length;
              const previous = options.mergeAdjacent ? units.at(-1) : undefined;
              const unit =
                previous?.id === incoming.id
                  ? yield* normalize({
                      id: incoming.id,
                      records: [...previous.records, ...incoming.records],
                    })
                  : incoming;
              if (previous?.id === incoming.id) {
                units.pop();
                queuedRecords -= previous.records.length;
              }
              if (unit.records.length > maximum) {
                drop(unit);
                return false;
              }
              if (overflow === "drop-newest" && queuedRecords + unit.records.length > maximum) {
                drop(unit);
                return false;
              }
              while (queuedRecords + unit.records.length > maximum) {
                const removed = units.shift()!;
                queuedRecords -= removed.records.length;
                drop(removed);
              }
              units.push(unit);
              queuedRecords += unit.records.length;
              return true;
            }),
          );
        });
        const take = Effect.fn("ObservabilityExportQueue.take")(function* () {
          return yield* observed(
            "take",
            Effect.sync(() => {
              const unit = units.shift();
              if (unit !== undefined) queuedRecords -= unit.records.length;
              return unit;
            }),
          );
        });
        const dropAll = Effect.fn("ObservabilityExportQueue.dropAll")(function* () {
          yield* observed(
            "dropAll",
            Effect.sync(() => {
              for (const unit of units.splice(0)) drop(unit);
              queuedRecords = 0;
            }),
          );
        });
        const stats = Effect.fn("ObservabilityExportQueue.stats")(function* () {
          return yield* observed(
            "stats",
            Effect.sync((): TelemetryExportQueueStats =>
              Object.freeze({
                receivedRecords,
                queuedRecords,
                queuedUnits: units.length,
                droppedRecords,
                droppedUnits,
              }),
            ),
          );
        });
        return Object.freeze({
          enqueue,
          take,
          dropAll,
          stats,
        }) satisfies TelemetryExportQueueEffects;
      }),
    );
  },
);

/**
 * Provides an independently acquired, substitutable export queue.
 *
 * @param options - Queue capacity and overflow policy.
 * @returns A live Layer providing TelemetryExportQueueService.
 * @example
 * const program = Effect.gen(function* () {
 *   const queue = yield* TelemetryExportQueueService;
 *   return yield* queue.stats();
 * }).pipe(Effect.provide(telemetryExportQueueLayer({ maxRecords: 8 })));
 */
export function telemetryExportQueueLayer(options: TelemetryExportQueueOptions) {
  return Layer.effect(TelemetryExportQueueService, makeBoundedTelemetryExportQueueEffect(options));
}
