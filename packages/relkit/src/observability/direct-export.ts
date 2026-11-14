import { Context, Effect, Exit, Layer, Queue, Schema, Scope } from "effect";
import type { TelemetryExportRecord } from "./telemetry-sampling.types.js";
import type { TelemetryExporterFanout } from "./telemetry-exporter.types.js";
import type { DirectExportItem, DirectExportOperations } from "./direct-export.types.js";
import { observeDirectExport as observe } from "./direct-export-metrics.js";
const MAX_QUEUED_EXPORTS = 1_024;
const MAX_ACTIVE_EXPORTS = 16;
/** A failed export or a record rejected when the bounded queue is full. */
export class DirectExportError extends Schema.TaggedError<DirectExportError>()(
  "DirectExportError",
  {
    reason: Schema.Literals(["export", "capacity"]),
    cause: Schema.Defect(),
  },
) {}
/** Substitutable direct export queue for Effect programs. */
// prettier-ignore
export class DirectExportService extends Context.Service<DirectExportService, DirectExportOperations>()(
  "@relkit/observability/DirectExport",
) {}
/**
 * Acquires a bounded export queue with workers owned by a Scope.
 *
 * @param exportRecord - Injectable callback for one admitted record.
 * @param onFailure - Called once for each rejected or failed record.
 * @returns Effect operations whose close drains and releases workers.
 * @example
 * const queue = await Effect.runPromise(makeDirectExportEffect(exportRecord, report));
 * await Effect.runPromise(queue.close());
 */
export const makeDirectExportEffect = Effect.fn("ObservabilityDirectExport.create")(
  function* (exportRecord: TelemetryExportRecord, onFailure: (error: DirectExportError) => void) {
    const scope = yield* Scope.make();
    const queue = yield* Queue.dropping<DirectExportItem>(MAX_QUEUED_EXPORTS);
    const waiters = new Set<() => void>();
    let pending = 0;
    let closed = false;
    let firstFailure: DirectExportError | undefined;
    const fail = (reason: "export" | "capacity", cause: unknown): void => {
      const error = new DirectExportError({ reason, cause });
      firstFailure ??= error;
      try {
        onFailure(error);
      } catch {
        /* A diagnostic callback cannot stop draining. */
      }
    };
    const complete = (): void => {
      pending -= 1;
      if (pending !== 0) return;
      for (const resume of waiters) resume();
      waiters.clear();
    };
    const worker = Effect.forever(
      Effect.gen(function* () {
        const item = yield* Queue.take(queue);
        yield* Effect.tryPromise({
          try: (signal) => Promise.resolve(exportRecord(item.record, item.decision, signal)),
          catch: (cause) => new DirectExportError({ reason: "export", cause }),
        }).pipe(
          Effect.catchTag("DirectExportError", (error) =>
            Effect.sync(() => fail(error.reason, error.cause)),
          ),
          Effect.ensuring(Effect.sync(complete)),
        );
      }),
    );
    for (let index = 0; index < MAX_ACTIVE_EXPORTS; index++)
      yield* worker.pipe(Effect.forkScoped, Scope.provide(scope));
    const awaitIdle = Effect.callback<void>((resume) => {
      if (pending === 0) {
        resume(Effect.void);
        return;
      }
      const waiter = () => {
        waiters.delete(waiter);
        resume(Effect.void);
      };
      waiters.add(waiter);
      return Effect.sync(() => {
        waiters.delete(waiter);
      });
    });
    const enqueue = Effect.fn("ObservabilityDirectExport.enqueue")(function* (
      item: DirectExportItem,
    ) {
      return yield* observe(
        "enqueue",
        Effect.sync(() => {
          if (closed) {
            fail("capacity", new Error("Telemetry exporter is closed"));
            return false;
          }
          pending += 1;
          const accepted = Queue.offerUnsafe(queue, item);
          if (!accepted) {
            pending -= 1;
            fail("capacity", new Error("Telemetry exporter queue capacity exceeded"));
          }
          return accepted;
        }),
      );
    });
    const flush = Effect.fn("ObservabilityDirectExport.flush")(function* () {
      return yield* observe(
        "flush",
        Effect.gen(function* () {
          yield* awaitIdle;
          if (firstFailure !== undefined) return yield* Effect.fail(firstFailure);
        }),
      );
    });
    const close = Effect.fn("ObservabilityDirectExport.close")(function* () {
      return yield* observe(
        "close",
        Effect.sync(() => {
          closed = true;
        }).pipe(
          Effect.andThen(flush()),
          Effect.ensuring(
            Effect.gen(function* () {
              yield* Scope.close(scope, Exit.void);
              yield* Queue.shutdown(queue);
            }),
          ),
        ),
      );
    });
    const shutdown = Effect.fn("ObservabilityDirectExport.shutdown")(function* () {
      yield* observe(
        "shutdown",
        Effect.gen(function* () {
          closed = true;
          yield* Scope.close(scope, Exit.void);
          yield* Queue.shutdown(queue);
        }),
      );
    });
    return DirectExportService.of({ enqueue, flush, close, shutdown });
  },
  (effect) => Effect.uninterruptible(observe("create", effect)),
);
/**
 * Chooses the record callback the export queue serves, if any.
 * @param options - Runtime exporter fan-out and direct callback options.
 * @returns The fan-out callback when it has at least one exporter lane, otherwise the direct
 *   callback; undefined when nothing can export, so no queue starts and nothing can fail.
 * @remarks Generated servers always pass a fan-out, which has zero lanes (an empty `stats()`)
 *   when the application configures no exporter. Queueing for it only produced capacity
 *   rejections that were reported as export failures.
 */
export function directExportTarget(options: {
  readonly exporter?: TelemetryExporterFanout;
  readonly exportRecord?: TelemetryExportRecord;
}): TelemetryExportRecord | undefined {
  if (options.exporter !== undefined && options.exporter.stats().length > 0)
    return options.exporter.exportRecord;
  return options.exportRecord;
}
/**
 * Counts one direct export failure under its reason.
 * @param counters - Mutable runtime counters.
 * @param error - Failed export (`export`) or record rejected by the full or closed queue (`capacity`).
 * @returns Nothing after the matching counter was incremented.
 */
export function countDirectExportFailure(
  counters: { exportFailures: number; exportCapacityRejections?: number },
  error: DirectExportError,
): void {
  if (error.reason === "export") counters.exportFailures += 1;
  else counters.exportCapacityRejections = (counters.exportCapacityRejections ?? 0) + 1;
}
/**
 * Provides an independently acquired direct exporter for an Effect Scope.
 *
 * @param exportRecord - Record callback, optionally observing interruption.
 * @param onFailure - Bounded diagnostic callback.
 * @returns A scoped Layer providing DirectExportService.
 * @example
 * const layer = directExportLayer(exportRecord, report);
 */
export const directExportLayer = (
  exportRecord: TelemetryExportRecord,
  onFailure: (error: DirectExportError) => void,
) =>
  Layer.effect(
    DirectExportService,
    Effect.acquireRelease(makeDirectExportEffect(exportRecord, onFailure), (queue) =>
      queue.shutdown(),
    ),
  );
