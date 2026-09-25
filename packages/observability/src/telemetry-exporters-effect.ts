import { Clock, Context, Duration, Effect, Exit, Layer, Metric, Schema } from "effect";
import { telemetryExportersCore } from "./telemetry-exporters-core.js";
import type { TelemetryExporterFanoutOptions } from "./telemetry-exporters.types.js";
import type { TelemetryExporterFanoutEffects } from "./telemetry-exporters-effect.types.js";
/**
 * Tagged fanout acquisition or lifecycle failure with its original cause.
 * @example
 * if (error._tag === "TelemetryFanoutError") console.error(error.operation);
 */
export class TelemetryFanoutError extends Schema.TaggedError<TelemetryFanoutError>()(
  "TelemetryFanoutError",
  { operation: Schema.String, message: Schema.String, cause: Schema.Unknown },
) {}
/**
 * Substitutable telemetry exporter fanout with owned lane lifetimes.
 * @example
 * const fanout = yield* TelemetryExporterFanoutService;
 */
// prettier-ignore
export class TelemetryExporterFanoutService extends Context.Service<TelemetryExporterFanoutService, TelemetryExporterFanoutEffects>()(
  "@relkit/observability/TelemetryExporterFanout",
) {}
function failure(operation: string, cause: unknown): TelemetryFanoutError {
  return new TelemetryFanoutError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
function observe<A>(operation: string, effect: Effect.Effect<A, TelemetryFanoutError>) {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        yield* Metric.update(
          Metric.counter("relkit_telemetry_fanout_operations_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_telemetry_fanout_operation_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
function asyncOperation<A>(operation: string, run: () => Promise<A>) {
  return observe(
    operation,
    Effect.uninterruptible(
      Effect.tryPromise({
        try: run,
        catch: (cause) => failure(operation, cause),
      }),
    ),
  );
}
function syncOperation<A>(name: string, run: () => A) {
  return observe(
    name,
    Effect.try({
      try: run,
      catch: (cause) => failure(name, cause),
    }),
  );
}
/**
 * Acquires exporter lanes and exposes dispatch, flush, and close as Effects.
 * The owner must close the result; use the Layer for scoped release.
 * @param options - Exporters, runtime modules, values, and failure handler.
 * @returns An Effect with the fanout or a tagged acquisition failure.
 * @example
 * const fanout = await Effect.runPromise(makeTelemetryExporterFanoutEffect(options));
 */
export const makeTelemetryExporterFanoutEffect = Effect.fn("TelemetryFanout.create")(
  (options: TelemetryExporterFanoutOptions) =>
    observe(
      "create",
      Effect.tryPromise({
        try: (signal) =>
          telemetryExportersCore.createTelemetryExporterFanout({
            ...options,
            signal:
              options.signal === undefined ? signal : AbortSignal.any([options.signal, signal]),
          }),
        catch: (cause) => failure("create", cause),
      }),
    ).pipe(
      Effect.map((fanout) =>
        TelemetryExporterFanoutService.of({
          exportRecord: Effect.fn("TelemetryFanout.exportRecord")((record, decision) =>
            syncOperation("exportRecord", () => {
              void fanout.exportRecord(record, decision);
            }),
          ),
          flush: Effect.fn("TelemetryFanout.flush")((timeoutMs) =>
            asyncOperation("flush", () => fanout.flush(timeoutMs)),
          ),
          close: Effect.fn("TelemetryFanout.close")((timeoutMs) =>
            asyncOperation("close", () => fanout.close(timeoutMs)),
          ),
          stats: Effect.fn("TelemetryFanout.stats")(() =>
            syncOperation("stats", () => fanout.stats()),
          ),
          setFailureHandler: Effect.fn("TelemetryFanout.setFailureHandler")((handler) =>
            syncOperation("setFailureHandler", () => fanout.setFailureHandler(handler)),
          ),
        }),
      ),
    ),
);
/**
 * Provides a fanout and closes all exporter lanes at Scope exit.
 * @param options - Exporter definitions and runtime modules.
 * @returns A scoped Layer with TelemetryExporterFanoutService.
 * @example
 * const program = Effect.gen(function* () { return yield* TelemetryExporterFanoutService; });
 * const layer = telemetryExporterFanoutLayer(options);
 */
export function telemetryExporterFanoutLayer(options: TelemetryExporterFanoutOptions) {
  return Layer.effect(
    TelemetryExporterFanoutService,
    Effect.acquireRelease(makeTelemetryExporterFanoutEffect(options), (fanout) =>
      fanout.close().pipe(Effect.orDie),
    ),
  );
}
