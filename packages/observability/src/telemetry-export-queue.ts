import { Effect } from "effect";
import {
  makeBoundedTelemetryExportQueueEffect,
  type TelemetryExportQueueError,
} from "./telemetry-export-queue-effect.js";
import type {
  BoundedTelemetryExportQueue,
  TelemetryExportQueueOptions,
  TelemetryExportUnit,
} from "./telemetry-export-queue.types.js";

export type {
  TelemetryExportOverflow,
  TelemetryExportUnit,
  TelemetryExportQueueStats,
  TelemetryExportQueueOptions,
  BoundedTelemetryExportQueue,
} from "./telemetry-export-queue.types.js";

function runCompatibility<A>(effect: Effect.Effect<A, TelemetryExportQueueError>): A {
  return Effect.runSync(
    effect.pipe(
      Effect.catchTag("TelemetryExportQueueError", (error) =>
        Effect.sync(() => {
          if (error.reason === "maxRecords") throw new RangeError(error.message);
          throw new TypeError(error.message);
        }),
      ),
    ),
  );
}

/**
 * Creates a bounded, synchronous export queue backed by Effect operations.
 *
 * @param options - Queue capacity and overflow behavior.
 * @returns A queue whose methods retain the existing synchronous API.
 * @throws {RangeError} If maxRecords is not a positive safe integer.
 * @example
 * const queue = createBoundedTelemetryExportQueue({ maxRecords: 64 });
 * queue.stats().queuedRecords; // 0
 */
export function createBoundedTelemetryExportQueue(
  options: TelemetryExportQueueOptions,
): BoundedTelemetryExportQueue {
  const queue = runCompatibility(makeBoundedTelemetryExportQueueEffect(options));
  return Object.freeze({
    enqueue: (unit: TelemetryExportUnit) => runCompatibility(queue.enqueue(unit)),
    take: () => runCompatibility(queue.take()),
    dropAll: () => runCompatibility(queue.dropAll()),
    stats: () => runCompatibility(queue.stats()),
  });
}
