import { Effect } from "effect";
import {
  DEFAULT_COLLECTOR_MAX_RECORDS,
  OBSERVABILITY_HOOK_PROTOCOL,
  OBSERVABILITY_HOOK_VERSION,
  makeObservabilityCollectorEffect,
  type ObservabilityCollectorError,
} from "./collector-effect.js";
import type {
  ObservabilityCollector,
  ObservabilityCollectorOptions,
  ObservabilityRecord,
} from "./collector.types.js";

export {
  DEFAULT_COLLECTOR_MAX_RECORDS,
  OBSERVABILITY_HOOK_PROTOCOL,
  OBSERVABILITY_HOOK_VERSION,
} from "./collector-effect.js";
export type { ObservabilityCollector, ObservabilityCollectorOptions } from "./collector.types.js";

function runCompatibility<A>(effect: Effect.Effect<A, ObservabilityCollectorError>): A {
  return Effect.runSync(
    effect.pipe(
      Effect.catchTag("ObservabilityCollectorError", (error) =>
        Effect.sync(() => {
          throw new TypeError(error.message);
        }),
      ),
    ),
  );
}

/**
 * Creates a bounded, memory-only observability admission point.
 *
 * @param options - Retention, redaction, and captured-signal policy.
 * @returns A collector whose synchronous methods run their Effect implementations.
 * @throws {TypeError} If retention or captured signals are invalid.
 * @example
 * const collector = createObservabilityCollector({ maxRecords: 100 });
 * collector.read();
 */
export function createObservabilityCollector(
  options: ObservabilityCollectorOptions = {},
): ObservabilityCollector {
  const collector = runCompatibility(makeObservabilityCollectorEffect(options));
  return Object.freeze({
    protocol: OBSERVABILITY_HOOK_PROTOCOL,
    version: OBSERVABILITY_HOOK_VERSION,
    emit: (event: unknown) => runCompatibility(collector.emit(event)),
    collect: (record: ObservabilityRecord) => runCompatibility(collector.collect(record)),
    collectRequired: (record: ObservabilityRecord) =>
      runCompatibility(collector.collectRequired(record)),
    read: () => runCompatibility(collector.read()),
    clear: () => runCompatibility(collector.clear()),
    dropped: () => runCompatibility(collector.dropped()),
    capture: (value: unknown) => runCompatibility(collector.capture(value)),
  });
}
