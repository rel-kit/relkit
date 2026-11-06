import { createHash } from "node:crypto";
import { Effect, Schema } from "effect";
import type { LogLevel, ObservabilityRecord } from "./model.js";
import type { TelemetryExportSamplingPolicy } from "./telemetry-config.js";
import type { TelemetryExportDecision } from "./telemetry-sampling.types.js";
import { observeSamplingOperation as observe } from "./telemetry-sampling-metrics.js";

export type { TelemetryExportDecision, TelemetryExportRecord } from "./telemetry-sampling.types.js";

/**
 * Invalid sampling input, including an empty trace identity or out-of-range rate.
 *
 * @example
 * Effect.runSync(traceIsSampledEffect("", 1).pipe(
 *   Effect.catchTag("TelemetrySamplingError", (error) => Effect.succeed(error.reason)),
 * ));
 */
export class TelemetrySamplingError extends Schema.TaggedError<TelemetrySamplingError>()(
  "TelemetrySamplingError",
  {
    reason: Schema.Literals(["traceId", "rate"]),
    message: Schema.String,
  },
) {}

const logLevels: readonly LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];

function invalid(reason: "traceId" | "rate"): TelemetrySamplingError {
  return new TelemetrySamplingError({
    reason,
    message:
      reason === "traceId"
        ? "Telemetry trace ID must be non-empty text"
        : "Telemetry trace sample rate must be between 0 and 1",
  });
}

/**
 * Deterministically selects a trace identity.
 *
 * @param traceId - Nonempty trace identity.
 * @param rate - Selection probability from zero to one.
 * @returns An Effect with the sampling decision or a tagged input error.
 * @example
 * Effect.runSync(traceIsSampledEffect("trace-a", 0.5));
 */
export const traceIsSampledEffect = Effect.fn("ObservabilitySampling.traceIsSampled")(function* (
  traceId: string,
  rate = 1,
) {
  return yield* observe(
    "traceIsSampled",
    Effect.gen(function* () {
      if (typeof traceId !== "string" || traceId === "")
        return yield* Effect.fail(invalid("traceId"));
      if (!Number.isFinite(rate) || rate < 0 || rate > 1)
        return yield* Effect.fail(invalid("rate"));
      if (rate === 0) return false;
      if (rate === 1) return true;
      const value = createHash("sha256").update(traceId).digest().readUInt32BE(0);
      return value / 0x1_0000_0000 < rate;
    }),
  );
});

/**
 * Selects whether to export one record after trace and severity filtering.
 *
 * @param record - Canonical observability record.
 * @param policy - Trace rate and minimum log level.
 * @returns An Effect with the export decision or a tagged sampling error.
 * @example
 * Effect.runSync(telemetryExportDecisionEffect(logRecord, { minimumLogLevel: "info" }));
 */
export const telemetryExportDecisionEffect = Effect.fn(
  "ObservabilitySampling.telemetryExportDecision",
)(function* (record: ObservabilityRecord, policy: TelemetryExportSamplingPolicy = {}) {
  return yield* observe(
    "telemetryExportDecision",
    Effect.gen(function* () {
      if (
        record.traceId !== undefined &&
        record.signal !== "generation" &&
        !(yield* traceIsSampledEffect(record.traceId, policy.traceRate))
      )
        return "sampled-out";
      if (
        record.signal === "log" &&
        logLevels.indexOf(record.level) < logLevels.indexOf(policy.minimumLogLevel ?? "info")
      )
        return "severity-filtered";
      return "export";
    }),
  );
});

/**
 * Classifies a record as an error for downstream telemetry policy.
 *
 * @param record - Canonical observability record.
 * @returns An Effect with the error classification.
 * @example
 * Effect.runSync(isTelemetryErrorEffect(logRecord));
 */
export const isTelemetryErrorEffect = Effect.fn("ObservabilitySampling.isTelemetryError")(
  function* (record: ObservabilityRecord) {
    return yield* observe(
      "isTelemetryError",
      Effect.sync(() => {
        if ("errorId" in record && typeof record.errorId === "string") return true;
        if (record.signal === "log") return record.level === "error" || record.level === "fatal";
        if (record.signal === "request") return record.outcome !== "success";
        if (record.signal === "invocation")
          return record.status !== "started" && record.status !== "success";
        if (record.signal === "job") return record.state === "dead-lettered";
        if (record.signal === "event")
          return record.state === "failed" || record.state === "dead-lettered";
        if (record.signal === "operation" || record.signal === "tool")
          return record.outcome !== "success";
        if (record.signal === "agent")
          return record.outcome !== undefined && record.outcome !== "success";
        if (record.signal === "span" || record.signal === "trace")
          return record.outcome !== undefined && record.outcome !== "success";
        return record.signal === "generation" && record.event === "failed";
      }),
    );
  },
);

function runCompatibility<A>(effect: Effect.Effect<A, TelemetrySamplingError>): A {
  return Effect.runSync(
    effect.pipe(
      Effect.catchTag("TelemetrySamplingError", (error) =>
        Effect.sync(() => {
          if (error.reason === "traceId") throw new TypeError(error.message);
          throw new RangeError(error.message);
        }),
      ),
    ),
  );
}

/**
 * Synchronous compatibility adapter for deterministic trace sampling.
 *
 * @param traceId - Nonempty trace identity.
 * @param rate - Selection probability from zero to one.
 * @returns Whether the trace is selected.
 * @throws {TypeError} For an empty trace identity.
 * @throws {RangeError} For an invalid rate.
 * @example
 * traceIsSampled("trace-a", 0.5);
 */
export function traceIsSampled(traceId: string, rate = 1): boolean {
  return runCompatibility(traceIsSampledEffect(traceId, rate));
}

/**
 * Synchronous compatibility adapter for export selection.
 *
 * @param record - Canonical observability record.
 * @param policy - Trace rate and minimum log level.
 * @returns The export decision.
 * @throws {RangeError} For an invalid trace rate.
 * @example
 * telemetryExportDecision(logRecord, { traceRate: 1 });
 */
export function telemetryExportDecision(
  record: ObservabilityRecord,
  policy: TelemetryExportSamplingPolicy = {},
): TelemetryExportDecision {
  return runCompatibility(telemetryExportDecisionEffect(record, policy));
}

/**
 * Synchronous compatibility adapter for error classification.
 *
 * @param record - Canonical observability record.
 * @returns Whether the record denotes an error.
 * @example
 * isTelemetryError(logRecord);
 */
export function isTelemetryError(record: ObservabilityRecord): boolean {
  return Effect.runSync(isTelemetryErrorEffect(record));
}
