import { Effect } from "effect";
import {
  makeTelemetryExporterFanoutEffect,
  type TelemetryFanoutError,
} from "./telemetry-exporters-effect.js";
import type { TelemetryExporterFanout } from "./telemetry-exporter.types.js";
import type { TelemetryExporterFanoutOptions } from "./telemetry-exporters.types.js";
export type { TelemetryExporterFanoutOptions } from "./telemetry-exporters.types.js";
export {
  TelemetryFanoutError,
  TelemetryExporterFanoutService,
  makeTelemetryExporterFanoutEffect,
  telemetryExporterFanoutLayer,
} from "./telemetry-exporters-effect.js";
export type { TelemetryExporterFanoutEffects } from "./telemetry-exporters-effect.types.js";
function legacy(error: TelemetryFanoutError): Error {
  return error.cause instanceof Error ? error.cause : new Error(error.message);
}
/**
 * Acquires validated exporter lanes with bounded, independent dispatch.
 * The caller owns close; Effect callers can use the scoped Layer.
 * @param options - Exporter definitions, modules, values, and failure sink.
 * @returns A fanout whose flush and close settle accepted records.
 * @throws {TypeError} If static exporter metadata is invalid.
 * @example
 * const fanout = await createTelemetryExporterFanout({ exporters, modules });
 * await fanout.close();
 */
export async function createTelemetryExporterFanout(
  options: TelemetryExporterFanoutOptions,
): Promise<TelemetryExporterFanout> {
  const fanout = await Effect.runPromise(
    makeTelemetryExporterFanoutEffect(options).pipe(Effect.mapError(legacy)),
  );
  const run = <A>(effect: Effect.Effect<A, TelemetryFanoutError>): Promise<A> =>
    Effect.runPromise(effect.pipe(Effect.mapError(legacy)));
  return Object.freeze({
    exportRecord: (record, decision) =>
      Effect.runSync(fanout.exportRecord(record, decision).pipe(Effect.mapError(legacy))),
    flush: (timeoutMs) => run(fanout.flush(timeoutMs)),
    close: (timeoutMs) => run(fanout.close(timeoutMs)),
    stats: () => Effect.runSync(fanout.stats().pipe(Effect.mapError(legacy))),
    setFailureHandler: (handler) =>
      Effect.runSync(fanout.setFailureHandler(handler).pipe(Effect.mapError(legacy))),
  } satisfies TelemetryExporterFanout);
}
