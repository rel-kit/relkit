import { PROTOCOL_VERSION } from "@relkit/contracts";
import { Context, Effect, Layer } from "effect";
import { OBSERVABILITY_MODEL_VERSION } from "./model.js";
import type { ObservabilityRecord, ObservabilitySignal } from "./model.js";
import { admitObservabilityRecordEffect } from "./record-admission.js";
import { captureRedactedEffect } from "./redaction.js";
import { toObservabilityRecordEffect } from "./collector-events.js";
import { observeCollectorOperation as observe } from "./collector-metrics.js";
import { invalidCollectorOptions as invalid } from "./collector-error.js";
import type {
  ObservabilityCollectorEffects,
  ObservabilityCollectorOptions,
} from "./collector.types.js";
import type { RedactedObservabilityRecord } from "./record-admission.js";

export const OBSERVABILITY_HOOK_PROTOCOL = "relkit.observability.hooks" as const;
export const OBSERVABILITY_HOOK_VERSION = PROTOCOL_VERSION;
export const DEFAULT_COLLECTOR_MAX_RECORDS = 1_024;
export { ObservabilityCollectorError } from "./collector-error.js";

/**
 * Injectable collector capability for Effect programs.
 *
 * @example
 * const program = Effect.gen(function* () {
 *   const collector = yield* ObservabilityCollectorService;
 *   return yield* collector.read();
 * });
 */
export class ObservabilityCollectorService extends Context.Service<
  ObservabilityCollectorService,
  ObservabilityCollectorEffects
>()("@relkit/observability/Collector") {}

const signals = new Set<ObservabilitySignal>([
  "request",
  "invocation",
  "job",
  "event",
  "operation",
  "tool",
  "agent",
  "log",
  "span",
  "trace",
  "diagnostic",
  "generation",
]);

function isAdmittedRecord(value: unknown): value is RedactedObservabilityRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { readonly version?: unknown }).version === OBSERVABILITY_MODEL_VERSION &&
    typeof (value as { readonly signal?: unknown }).signal === "string" &&
    signals.has((value as { readonly signal: ObservabilitySignal }).signal)
  );
}

/**
 * Creates an in-memory collector with all operations in Effect.
 *
 * @param options - Retention, redaction, and captured-signal policy.
 * @returns An Effect producing the collector or a tagged validation error.
 * @example
 * const collector = Effect.runSync(makeObservabilityCollectorEffect({ maxRecords: 32 }));
 * Effect.runSync(collector.read());
 */
export const makeObservabilityCollectorEffect = Effect.fn("ObservabilityCollector.create")(
  function* (options: ObservabilityCollectorOptions = {}) {
    return yield* observe(
      "create",
      Effect.gen(function* () {
        const maxRecords = options.maxRecords ?? DEFAULT_COLLECTOR_MAX_RECORDS;
        if (!Number.isSafeInteger(maxRecords) || maxRecords < 1)
          return yield* Effect.fail(invalid("maxRecords"));
        const capturedSignals =
          options.signals === undefined ? undefined : new Set(options.signals);
        if (capturedSignals?.size !== options.signals?.length)
          return yield* Effect.fail(invalid("duplicateSignals"));
        if ([...(capturedSignals ?? [])].some((signal) => !signals.has(signal)))
          return yield* Effect.fail(invalid("signal"));
        const retained: RedactedObservabilityRecord[] = [];
        let dropped = 0;

        const retain = (record: ObservabilityRecord) =>
          Effect.gen(function* () {
            const admitted = yield* admitObservabilityRecordEffect(record, options.redaction).pipe(
              Effect.mapError((error) => invalid("redaction", error.message)),
            );
            if (!isAdmittedRecord(admitted)) return undefined;
            if (retained.length >= maxRecords) {
              retained.shift();
              dropped += 1;
            }
            retained.push(admitted);
            return admitted;
          });
        const collectRequired = Effect.fn("ObservabilityCollector.collectRequired")(function* (
          record: ObservabilityRecord,
        ) {
          return yield* observe("collectRequired", retain(record));
        });
        const collect = Effect.fn("ObservabilityCollector.collect")(function* (
          record: ObservabilityRecord,
        ) {
          return yield* observe(
            "collect",
            Effect.gen(function* () {
              if (capturedSignals !== undefined && !capturedSignals.has(record.signal))
                return undefined;
              return yield* retain(record);
            }),
          );
        });
        const emit = Effect.fn("ObservabilityCollector.emit")(function* (event: unknown) {
          return yield* observe(
            "emit",
            Effect.gen(function* () {
              const record = yield* toObservabilityRecordEffect(event);
              return record === undefined ? undefined : yield* collect(record);
            }),
          );
        });
        const read = Effect.fn("ObservabilityCollector.read")(function* () {
          return yield* observe(
            "read",
            Effect.sync(() => Object.freeze([...retained])),
          );
        });
        const clear = Effect.fn("ObservabilityCollector.clear")(function* () {
          yield* observe(
            "clear",
            Effect.sync(() => {
              retained.length = 0;
              dropped = 0;
            }),
          );
        });
        const droppedCount = Effect.fn("ObservabilityCollector.dropped")(function* () {
          return yield* observe("dropped", Effect.succeed(dropped));
        });
        const capture = Effect.fn("ObservabilityCollector.capture")(function* (value: unknown) {
          return yield* observe(
            "capture",
            captureRedactedEffect(value, options.redaction ?? {}).pipe(
              Effect.mapError((error) => invalid("redaction", error.message)),
            ),
          );
        });
        return Object.freeze({
          emit,
          collect,
          collectRequired,
          read,
          clear,
          dropped: droppedCount,
          capture,
        }) satisfies ObservabilityCollectorEffects;
      }),
    );
  },
);

/**
 * Provides a substitutable collector acquired when the Layer is built.
 *
 * @param options - Retention, redaction, and signal policy.
 * @returns A live Layer containing ObservabilityCollectorService.
 * @example
 * const program = Effect.gen(function* () {
 *   const collector = yield* ObservabilityCollectorService;
 *   return yield* collector.read();
 * }).pipe(Effect.provide(observabilityCollectorLayer({ maxRecords: 32 })));
 */
export function observabilityCollectorLayer(options: ObservabilityCollectorOptions = {}) {
  return Layer.effect(ObservabilityCollectorService, makeObservabilityCollectorEffect(options));
}
